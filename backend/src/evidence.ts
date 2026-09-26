/** Operational coverage/review policy, not a scientifically validated classifier. */
export const EVIDENCE_VERSION = 'longitudinal-v2';
type Row = Record<string, any>;
const parsed = (row: Row): Row[] => (row.artifacts || row.stylometry?.files || []).filter((f: Row) => f.status === 'parsed');
const testFile = (path: string) => /(^|\/)(tests?|__tests__)(\/|$)|(^|\/)(test_[^/]+|[^/]+[._](test|spec)\.[^/]+)$/i.test(path);

/** Follow graph ancestry, never infer ancestry from commit timestamps. */
export function ancestorHistory(rows: Row[], parent: string | undefined): Row[] {
  const bySha = new Map(rows.map(row=>[row.sha,row]));
  const seen = new Set<string>();
  const result: Row[] = [];
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const row = bySha.get(parent);
    if (!row) break;
    result.push(row);
    // Merges and missing legacy parent metadata stop an individual-development chain.
    parent = row.parents?.length===1 ? row.parents[0] : undefined;
  }
  return result.reverse();
}

export function baseline(history: Row[]) {
  const latest = new Map<string, Row>();
  const times: number[] = [];
  let meaningfulCommits = 0;
  const fingerprints = new Set<string>();
  for (const row of history) {
    let changed = false;
    for (const f of parsed(row)) {
      const key = `${row.repository_id || ''}:${f.path}`;
      if (f.fingerprint && !fingerprints.has(`${key}:${f.fingerprint}`)) {
        changed = true; fingerprints.add(`${key}:${f.fingerprint}`);
      }
      latest.set(key, f);
    }
    for (const f of row.files || []) {
      if (f.status === 'removed') latest.delete(`${row.repository_id || ''}:${f.path}`);
      if (f.previousPath) latest.delete(`${row.repository_id || ''}:${f.previousPath}`);
    }
    if (changed && (row.velocity?.metrics?.additions || 0) + (row.velocity?.metrics?.deletions || 0) >= 10) {
      meaningfulCommits++;
      const time = new Date(row.committed_at).getTime();
      if (Number.isFinite(time)) times.push(time);
    }
  }
  times.sort((a,b) => a-b);
  const files = [...new Map([...latest.values()].map(f=>[f.fingerprint || f.path,f])).values()];
  const categories = new Set(files.flatMap(f => Object.keys(f.nodeDistribution || {}).filter(k =>
    /function|method|class|if_statement|for_statement|while_statement|try_statement|import/.test(k))));
  const observed = { historyCommits: history.length, meaningfulCommits,
    sourceLines: files.reduce((n,f)=>n+f.lines,0), functions: files.reduce((n,f)=>n+(f.functionCount || 0),0),
    files: files.length, sessions: times.filter((t,i)=>!i || t-times[i-1]>=4*3600000).length,
    spreadDays: times.length ? (times[times.length-1]-times[0])/86400000 : 0, structuralCategories: categories.size };
  const requirements = { meaningfulCommits: 12, sourceLines: 500, functions: 20, files: 3, sessions: 5, spreadDays: 14, structuralCategories: 4 };
  const missing = Object.entries(requirements).filter(([key,min])=>observed[key as keyof typeof observed]<min).map(([key,min])=>`${key}: ${observed[key as keyof typeof observed]} / ${min}`);
  return { status: missing.length ? 'learning' : 'established', observed, requirements, missing,
    interpretation: 'Coverage gates, not validated authorship confidence. Sessions are timestamp-separated commit groups, not measured working time. Repeated file snapshots count once.' };
}

export function continuity(history: Row[], style: Row, files: Row[], parents: string[]) {
  const latest = new Map<string, Row>();
  for (const h of history) {
    for (const f of parsed(h)) latest.set(f.path,{...f,sha:h.sha});
    for (const f of h.files || []) {if (f.status==='removed') latest.delete(f.path); if (f.previousPath) latest.delete(f.previousPath);}
  }
  const previous = [...latest.values()];
  const symbols = new Set(previous.flatMap(f=>(f.symbols || []).map((s: Row)=>s.name)));
  const imports = new Set(previous.flatMap(f=>f.imports || []));
  const fingerprints = new Set(previous.flatMap(f=>(f.symbols || []).map((s: Row)=>s.fingerprint)));
  const current = parsed({artifacts:style.files});
  const observations = current.map(f=>{
    const prior = latest.get(f.path);
    return { path:f.path, previousSha:prior?.sha || null, existingModule:!!prior,
      reusedSymbols:(f.symbols || []).filter((s: Row)=>symbols.has(s.name)).map((s: Row)=>s.name),
      callsToHistoricalSymbols:(f.calls || []).filter((s: string)=>symbols.has(s)),
      retainedImports:(f.imports || []).filter((s: string)=>imports.has(s)),
      introducedImports:(f.imports || []).filter((s: string)=>!imports.has(s)),
      unchangedOrMovedSymbols:(f.symbols || []).filter((s: Row)=>fingerprints.has(s.fingerprint)).map((s: Row)=>s.name),
      nodeChange:prior ? f.nodes-prior.nodes : null,
      nestingChange:prior ? f.vector[6]-prior.vector[6] : null };
  });
  const related = observations.filter(f=>f.existingModule || f.reusedSymbols.length || f.callsToHistoricalSymbols.length || f.retainedImports.length);
  const tests = files.filter(f=>!f.excluded && testFile(f.path)).map(f=>({path:f.path,status:f.status,additions:f.additions,deletions:f.deletions}));
  const parentCovered = parents.length===1 && history.some(h=>h.sha===parents[0] && h.status!=='partial' && !h.stylometry?.error && parsed(h).length);
  const after = new Map(latest);
  for (const f of current) after.set(f.path,f);
  for (const f of files) {if(f.status==='removed') after.delete(f.path); if(f.previousPath) after.delete(f.previousPath);}
  const architecture = (items: Row[]) => ({files:items.length,nodes:items.reduce((n,f)=>n+f.nodes,0),
    functions:items.reduce((n,f)=>n+(f.functionCount || 0),0),imports:[...new Set(items.flatMap(f=>f.imports || []))]});
  return { status: !previous.length || !current.length ? 'unavailable' : related.length ? 'structural_links_observed' : 'new_structure_observed',
    historicalFiles:previous.length, comparedFiles:current.length, relatedFiles:related.length, parentCovered,
    repositoryEvolution:{before:architecture(previous),after:architecture([...after.values()]),scope:'Observed authored source snapshots only; not a complete repository dependency graph'},
    observations, tests, featureSemantics:{status:'not_established',interpretation:'Symbol/import/call relationships are observed; logical feature progression requires technical explanation and faculty interpretation.'},historicalReferences:history.map(h=>h.sha),
    limitations:['Structural relationships do not establish feature semantics or authorship.', 'New modules and libraries are normal during feature development.',
      'Only retrieved authored source history is represented; offline work and unobserved branches are unknown.',
      ...(!parentCovered ? ['Immediate parent AST coverage is missing; automatic review routing abstains.'] : [])] };
}

export function evidenceSummary(history: Row[], style: Row, velocity: Row, files: Row[], parents: string[], quizScore: number|null = null, notes: string[] = []) {
  const maturity = baseline(history);
  const languageBaselines = (style.languages || []).map((language: Row)=>({language:language.language,
    ...baseline(history.map(h=>({...h,artifacts:parsed(h).filter(f=>f.language===language.language)})))}));
  const development = continuity(history,style,files,parents);
  const styleChanges = (style.languages || []).filter((l: Row)=>l.distance>=l.threshold && l.changedFeatures?.length>=2);
  const eligible = files.filter(f=>!f.excluded && f.supported && f.status!=='removed');
  const adequateCoverage = eligible.length>0 && parsed({artifacts:style.files}).length===eligible.length && !notes.length && development.parentCovered &&
    languageBaselines.length>0 && languageBaselines.every((b: Row)=>b.status==='established');
  // Corroboration across structure and style; velocity is contextual and never a deciding vote.
  const changedModules = development.observations.filter(f=>!f.existingModule && !f.reusedSymbols.length && !f.callsToHistoricalSymbols.length &&
    !f.retainedImports.length && f.introducedImports.length>0 && (style.files || []).some((s: Row)=>s.path===f.path && s.comparison?.distance>=3));
  const review = maturity.status==='established' && adequateCoverage && changedModules.length>0 &&
    (styleChanges.length>0 || changedModules.some(f=>(style.files || []).find((s: Row)=>s.path===f.path)?.comparison?.changedFeatures?.length>=2));
  const abstained = maturity.status!=='established' || !adequateCoverage;
  const reasons = [
    ...(maturity.status!=='established' ? ['Personal baseline is still learning; no strong authorship judgment is made.'] : []),
    ...(!adequateCoverage ? ['Incomplete source or parent-history coverage limits interpretation.'] : []),
    ...(velocity.flagged ? ['Commit volume/timing differs from observed history. Offline feature development can explain this; it cannot trigger review alone.'] : []),
    ...(styleChanges.length ? ['Multiple AST feature deviations observed; language/task and baseline coverage must be considered.'] : []),
    ...(development.status==='structural_links_observed' ? ['Changed code has structural links to earlier development; inspect file references.'] : []),
    ...(review ? ['Established history, AST deviations and new unlinked module/import structure warrant a neutral technical discussion.'] : []) ];
  return { version:EVIDENCE_VERSION, status:abstained ? 'Insufficient evidence' : review ? 'Requires faculty review' : styleChanges.length || velocity.flagged ? 'Development changes observed' : 'Consistent with observed history',
    abstained, reviewRequested:review, reasons, baseline:{...maturity,languages:languageBaselines}, continuity:development, surfacedFiles:changedModules.map(f=>f.path),
    velocity:{...velocity, interpretation:'Descriptive deviation; not misconduct risk'},
    stylometry:{languages:style.languages || [], files:style.files || [], interpretation:'Uncalibrated descriptive distances'},
    exclusions:files.filter(f=>f.excluded), coverage:{eligibleFiles:eligible.length,parsedFiles:parsed({artifacts:style.files}).length,adequate:adequateCoverage,notes},
    model:{status:(style.languages || []).some((l: Row)=>l.modelStatus==='experimental_trained') ? 'trained_uncalibrated' : 'unavailable', calibration:'unavailable', authorshipProbability:null,
      limitation:'No independently validated labelled authorship dataset is configured.'},
    technicalUnderstanding:{status:quizScore===null ? 'not_available' : 'llm_assessed', rubricPoints:quizScore, interpretation:'Supporting LLM assessment, not ground truth; faculty review required'},
    uncertainty:{confidence:'not_quantified', limitations:['No calibrated authorship probability is available.', 'Commit timestamps do not measure time spent developing.', 'Operational review criteria have not been scientifically validated.',...development.limitations]} };
}

export function publicEvidence(commit: Row) {
  if (!commit.signals?.version && !commit.signals?.evidence) return {version:EVIDENCE_VERSION,status:'Insufficient evidence',abstained:true,reviewRequested:false,
    reasons:['Analysis or eligible history is not yet available.'],baseline:{status:'learning'},
    model:{status:'unavailable',calibration:'unavailable',authorshipProbability:null}};
  return commit.signals?.evidence || {version:'legacy',status:'Legacy evidence — reassessment required',abstained:true,reviewRequested:false,
    reasons:['Historical heuristic scores are retained for audit, not interpreted as authorship probabilities.'],
    baseline:{status:'not_assessed'},model:{status:'unavailable',calibration:'unavailable',authorshipProbability:null}};
}
