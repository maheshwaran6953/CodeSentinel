"""Isolated tree-sitter extraction and experimental author classification. JSON stdin/stdout.

Source is parsed only; never imported or executed. Models require multiple real authors.
No fabricated labels, probabilities, or automatic claims of validated authorship.
"""
import json
import math
import sys
import hashlib
import os
from pathlib import Path
from collections import Counter
import numpy as np
from tree_sitter import Language, Parser
import tree_sitter_python as python
import tree_sitter_javascript as javascript
import tree_sitter_typescript as typescript
import tree_sitter_java as java

VERSION = 'ast-v1'
LANGUAGES = {
    'py': Language(python.language()), 'js': Language(javascript.language()),
    'jsx': Language(javascript.language()), 'ts': Language(typescript.language_typescript()),
    'tsx': Language(typescript.language_tsx()), 'java': Language(java.language()),
}
FUNCTIONS = {'function_definition', 'function_declaration', 'method_definition',
             'method_declaration', 'constructor_declaration', 'arrow_function', 'function_expression'}
CONDITIONS = {'if_statement', 'switch_statement', 'switch_expression', 'conditional_expression', 'ternary_expression'}
LOOPS = {'for_statement', 'for_in_statement', 'enhanced_for_statement', 'while_statement', 'do_statement'}
KEYS = ['identifier_length', 'identifier_std', 'snake_ratio', 'camel_ratio', 'function_length',
        'function_density', 'nesting_depth', 'conditional_density', 'for_ratio', 'loop_density',
        'comment_density', 'call_density', 'exception_density', 'literal_density',
        'import_density', 'return_density', 'type_diversity']

def extract(source, extension):
    if extension not in LANGUAGES:
        return {'status': 'unsupported_language'}
    encoded = source.encode('utf8')
    if not encoded.strip():
        return {'status': 'empty'}
    tree = Parser(LANGUAGES[extension]).parse(encoded)
    if tree.root_node.has_error:
        return {'status': 'parse_error'}
    counts, identifiers, lengths, comment_lines = Counter(), [], [], set()
    max_depth, nodes = 0, 0
    stack = [(tree.root_node, 0)]
    while stack:
        node, depth = stack.pop()
        if not node.is_named:
            continue
        nodes += 1
        counts[node.type] += 1
        next_depth = depth + int(node.type in CONDITIONS | LOOPS | {'try_statement', 'catch_clause'})
        max_depth = max(max_depth, next_depth)
        if node.type in {'identifier', 'property_identifier', 'field_identifier'}:
            identifiers.append(encoded[node.start_byte:node.end_byte].decode('utf8'))
        if node.type in FUNCTIONS:
            lengths.append(node.end_point.row - node.start_point.row + 1)
        if 'comment' in node.type:
            comment_lines.update(range(node.start_point.row, node.end_point.row + 1))
        stack.extend((child, next_depth) for child in node.named_children)
    n = max(1, len(identifiers))
    lines = max(1, len(source.splitlines()))
    loops = sum(counts[t] for t in LOOPS)
    values = [
        sum(map(len, identifiers))/n,
        float(np.std([len(i) for i in identifiers])) if identifiers else 0,
        sum('_' in i.strip('_') and i.lower() == i for i in identifiers)/n,
        sum(i[:1].islower() and '_' not in i and any(c.isupper() for c in i) for i in identifiers)/n,
        sum(lengths)/max(1, len(lengths)), len(lengths)/nodes, max_depth,
        sum(counts[t] for t in CONDITIONS)/nodes,
        sum(counts[t] for t in LOOPS if 'for' in t)/max(1, loops), loops/nodes,
        len(comment_lines)/lines,
        sum(v for k,v in counts.items() if k in {'call','call_expression','method_invocation'})/nodes,
        sum(v for k,v in counts.items() if k in {'try_statement','catch_clause','except_clause','throw_statement','raise_statement'})/nodes,
        sum(v for k,v in counts.items() if 'literal' in k or k in {'string','integer','float','number'})/nodes,
        sum(v for k,v in counts.items() if 'import' in k)/nodes,
        counts['return_statement']/nodes, len(counts)/nodes,
    ]
    return {'status': 'parsed', 'language': {'jsx':'js','tsx':'ts'}.get(extension, extension),
            'version': VERSION, 'vector': values, 'featureNames': KEYS,
            'nodes': nodes, 'lines': lines, 'nodeDistribution': dict(counts)}

def assess(payload):
    files = [{ 'path': f['path'], **extract(f['source'], f['path'].rsplit('.',1)[-1].lower()) }
             for f in payload['files']]
    groups = {}
    for f in files:
        if f['status'] == 'parsed':
            groups.setdefault(f['language'], []).append(f)
    features = {}
    evidence = []
    risks = []
    for language, items in groups.items():
        vector = np.average([f['vector'] for f in items], axis=0, weights=[f['nodes'] for f in items])
        nodes = sum(f['nodes'] for f in items)
        features[language] = {'vector': vector.tolist(), 'nodes': nodes, 'version': VERSION}
        history = [h for h in payload.get('history', []) if h.get('features', {}).get(language, {}).get('version') == VERSION
                   and h['features'][language]['nodes'] >= 80]
        own = [h for h in history if h['student_id'] == payload['studentId']]
        result = {'language': language, 'historyCount': len(own), 'nodes': nodes, 'risk': None,
                  'maturity': 'insufficient_history' if len(own)<3 else 'learning', 'modelStatus': 'not_trained'}
        if len(own) >= 8 and nodes >= 80:
            x = np.array([h['features'][language]['vector'] for h in own[-30:]])
            scale = np.maximum(x.std(axis=0), np.maximum(np.abs(x.mean(axis=0))*0.15, 0.02))
            z = np.abs((vector-x.mean(axis=0))/scale)
            # Descriptive change indicator until a multiclass classifier can be trained.
            distance = float(np.mean(np.sort(z)[-5:]))
            result.update(maturity='stable', method='standardized_ast_distance', distance=distance,
                          threshold=3, risk=min(100, distance/6*100),
                          changedFeatures=[KEYS[i] for i in np.argsort(z)[-5:] if z[i]>=3])
            counts = Counter(h['student_id'] for h in history)
            authors = sorted(a for a,c in counts.items() if c>=10)
            if len(authors)>=3 and payload['studentId'] in authors:
                from xgboost import XGBClassifier
                from sklearn.metrics import balanced_accuracy_score
                training, holdout = [], []
                for author in authors:
                    rows = [h for h in history if h['student_id']==author][-50:]
                    split = max(1, int(len(rows)*0.8))
                    training.extend(rows[:split]); holdout.extend(rows[split:])
                tx = np.array([h['features'][language]['vector'] for h in training])
                ty = np.array([authors.index(h['student_id']) for h in training])
                vx = np.array([h['features'][language]['vector'] for h in holdout])
                vy = np.array([authors.index(h['student_id']) for h in holdout])
                fingerprint = hashlib.sha256(json.dumps([VERSION,language,training], sort_keys=True).encode()).hexdigest()
                folder = Path(os.environ.get('MODEL_DIRECTORY') or str(Path(__file__).parent / 'models'))
                folder.mkdir(exist_ok=True)
                model_path = folder / f'{language}.json'
                metadata_path = folder / f'{language}.metadata.json'
                model = XGBClassifier(n_estimators=60, max_depth=3, learning_rate=0.07,
                                      subsample=1, colsample_bytree=1, random_state=42, n_jobs=1)
                metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
                if metadata.get('fingerprint') == fingerprint and model_path.exists():
                    model.load_model(model_path)
                else:
                    model.fit(tx, ty)
                    model.save_model(model_path)
                    metadata_path.write_text(json.dumps({'fingerprint': fingerprint,'authors':authors,'features':KEYS,'version':VERSION}))
                accuracy = float(balanced_accuracy_score(vy, model.predict(vx)))
                consistency = float(model.predict_proba(np.array([vector]))[0][authors.index(payload['studentId'])])
                result.update(modelStatus='experimental_trained', modelVersion=fingerprint[:12],
                              authorCount=len(authors), trainingSamples=len(training), holdoutSamples=len(holdout),
                              holdoutBalancedAccuracy=accuracy, uncalibratedConsistency=consistency)
                # Holdout is a temporal per-author split, not a claim of cross-project validation.
                if accuracy>=0.65:
                    result.update(method='xgboost_experimental', risk=(1-consistency)*100)
                else:
                    result['modelStatus'] = 'insufficient_holdout_performance'
            risks.append(result['risk'])
        evidence.append(result)
    risk = float(np.mean(risks)) if risks else None
    return {'features': features, 'files': files, 'languages': evidence, 'risk': risk,
            'flagged': any(e['risk'] is not None and e['risk']>=50 for e in evidence),
            'maturity': 'stable' if risks else 'learning', 'featureVersion': VERSION,
            'limitations': 'History is not verified ground truth; style varies with task, language and collaboration. Class probabilities are uncalibrated. Human review required.'}

if __name__ == '__main__':
    try:
        print(json.dumps(assess(json.load(sys.stdin)), allow_nan=False))
    except Exception as error:
        print(json.dumps({'error': type(error).__name__}), file=sys.stderr)
        sys.exit(1)
