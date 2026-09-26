import unittest
import tempfile
from unittest.mock import patch
from analyze import extract, assess, VERSION

class StylometryTests(unittest.TestCase):
    def test_supported_languages(self):
        for extension, source in {'py':'def foo_bar(x):\n    return x + 1\n',
                                  'js':'function fooBar(x) { return x + 1; }',
                                  'ts':'function fooBar(x: number): number { return x + 1; }',
                                  'tsx':'const Page = () => <div>Hello</div>;',
                                  'java':'class Main { int fooBar(int x) { return x + 1; } }'}.items():
            result = extract(source, extension)
            self.assertEqual(result['status'], 'parsed', extension)
            self.assertGreater(result['nodes'], 0)
            self.assertEqual(len(result['vector']), len(result['featureNames']))

    def test_ast_structure_and_identifier_style(self):
        result = extract('def parse_node(input_value):\n    # explanation\n    for child_node in input_value:\n        if child_node:\n            print(child_node)\n', 'py')
        features = dict(zip(result['featureNames'], result['vector']))
        self.assertGreater(features['snake_ratio'], 0.5)
        self.assertEqual(features['nesting_depth'], 2)
        self.assertGreater(features['comment_density'], 0)

    def test_no_history_means_no_prediction(self):
        result = assess({'studentId':'one','files':[{'path':'a.py','source':'def value(x):\n    return x\n'}],'history':[]})
        self.assertIsNone(result['risk'])
        self.assertFalse(result['flagged'])
        self.assertEqual(result['languages'][0]['modelStatus'],'unavailable')

    def test_invalid_source_is_reported(self):
        self.assertEqual(extract('def (broken', 'py')['status'], 'parse_error')
        self.assertEqual(extract('abc', 'unknown')['status'], 'unsupported_language')

    def test_xgboost_trains_and_reloads_only_with_sufficient_authors(self):
        # Deterministic test-only author styles exercise the real training path.
        styles = [
            '\n'.join(f'def parse_node_{i}(input_value):\n    for child_node in input_value:\n        if child_node:\n            print(child_node)\n    return input_value\n' for i in range(12)),
            '\n'.join(f'def parseNode{i}(inputValue):\n    # Explain each step\n    try:\n        return inputValue + 2\n    except Exception:\n        return 0\n' for i in range(12)),
            '\n'.join(f'def f{i}(x):\n    while x > 0:\n        x = x - 1\n    return x\n' for i in range(12)),
        ]
        history = []
        for i, source in enumerate(styles):
            value = extract(source,'py')
            history.extend({'student_id':str(i),'features':{'py':{'version':VERSION,'nodes':value['nodes'],'vector':value['vector']}}} for _ in range(10))
        payload = {'studentId':'0','files':[{'path':'a.py','source':styles[0]}],'history':history}
        self.assertEqual(assess(payload)['languages'][0]['modelStatus'], 'unavailable')
        # Test-only training authorization exercises infrastructure, not a validation claim.
        payload['trainingDataset'] = {'id':'synthetic-unit-test-only','consented':True,'independentlyVerified':True}
        with tempfile.TemporaryDirectory() as directory, patch.dict('os.environ', {'MODEL_DIRECTORY':directory}):
            first = assess(payload)['languages'][0]
            second = assess(payload)['languages'][0]
        self.assertEqual(first['modelStatus'],'experimental_trained')
        self.assertEqual(first['modelMethod'],'xgboost_experimental')
        self.assertIsNone(first['authorshipProbability'])
        self.assertEqual(first['modelVersion'],second['modelVersion'])
        self.assertGreater(first['uncalibratedConsistency'],0)

    def test_mature_personal_baseline_is_stable_for_same_style(self):
        source = '\n'.join(f'def function_{i}(input_value):\n    for item in input_value:\n        if item:\n            print(item)\n    return input_value\n' for i in range(12))
        extracted = extract(source,'py')
        history = [{'student_id':'one','features':{'py':{'version':VERSION,'nodes':extracted['nodes'],'vector':extracted['vector']}}} for _ in range(8)]
        result = assess({'studentId':'one','files':[{'path':'a.py','source':source}],'history':history})
        self.assertAlmostEqual(result['risk'],0)
        self.assertEqual(result['languages'][0]['method'],'standardized_ast_distance')
        self.assertEqual(result['languages'][0]['modelStatus'],'unavailable')
        self.assertEqual(result['maturity'],'learning')

    def test_structural_artifacts_and_function_comparison(self):
        source = 'import json\n\ndef parse_value(input_value):\n    return json.loads(input_value)\n'
        first = assess({'studentId':'one','files':[{'path':'a.py','source':source}],'history':[]})
        self.assertEqual(first['files'][0]['symbols'][0]['name'], 'parse_value')
        self.assertEqual(first['files'][0]['imports'], ['import json'])
        self.assertIn('json.loads',first['files'][0]['calls'])
        history = [{'student_id':'one','features':first['features'],'artifacts':first['files']} for _ in range(3)]
        second = assess({'studentId':'one','files':[{'path':'a.py','source':source}],'history':history})
        self.assertEqual(second['files'][0]['comparison']['distance'], 0)
        self.assertEqual(second['files'][0]['symbols'][0]['comparison']['distance'], 0)

    def test_excluded_history_without_features_is_not_a_model_input(self):
        result = assess({'studentId':'one','files':[{'path':'a.py','source':'def value(x):\n    return x\n'}],
                         'history':[{'student_id':'one','features':None,'artifacts':[]}]})
        self.assertEqual(result['files'][0]['status'],'parsed')
        self.assertEqual(result['languages'][0]['historyCount'],0)
        self.assertIsNone(result['risk'])

if __name__ == '__main__':
    unittest.main()
