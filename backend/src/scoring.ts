export interface Metrics { additions: number; deletions: number; files: number; gapHours: number | null }
const average = (values: number[]) => values.reduce((a,b) => a+b,0)/values.length;
export function velocity(current: Metrics, history: Metrics[], threshold = 3) {
  const mature = history.length >= 8;
  const details: Record<string, { value: number; mean: number; deviation: number; z: number }> = {};
  for (const key of ['additions','deletions','files','gapHours'] as const) {
    const value = current[key];
    const values = history.map(h => h[key]).filter((v): v is number => v !== null && Number.isFinite(v)).map(v => Math.log1p(Math.max(0,v)));
    if (value === null || values.length < 8) continue;
    const mean = average(values);
    const deviation = Math.max(0.25, Math.sqrt(average(values.map(v => (v-mean)**2))));
    const z = (Math.log1p(Math.max(0,value))-mean)/deviation;
    details[key] = { value, mean, deviation, z: key === 'gapHours' ? Math.abs(z) : Math.max(0,z) };
  }
  const z = Math.max(0,...Object.values(details).map(d => d.z));
  const reasons = mature ? Object.entries(details).filter(([,d]) => d.z >= threshold).map(([key,d]) => `${key} differs from personal history (z=${d.z.toFixed(2)}, threshold=${threshold})`) : [];
  return { metrics: current, historyCount: history.length, maturity: mature ? 'statistical_samples_available' : 'learning', threshold, z,
    risk: mature ? Math.min(100,z/6*100) : null, flagged: reasons.length>0, reasons, details };
}
export function combine(velocityRisk: number | null, stylometryRisk: number | null, quizScore: number | null) {
  const signals = { velocity: velocityRisk, stylometry: stylometryRisk, quiz: quizScore === null ? null : 100-quizScore };
  const weights = { velocity: 0.3, stylometry: 0.4, quiz: 0.3 };
  let total = 0, weight = 0;
  for (const key of Object.keys(signals) as (keyof typeof signals)[]) {
    const value = signals[key];
    if (value !== null && Number.isFinite(value)) { total += Math.max(0,Math.min(100,value))*weights[key]; weight += weights[key]; }
  }
  const riskScore = weight ? Math.round(total/weight*100)/100 : null;
  return { riskScore, authenticityScore: riskScore === null ? null : Math.round((100-riskScore)*100)/100,
    signals, weights, availableWeight: weight, version: '1.0', interpretation: 'Anomaly evidence, not proof of misconduct' };
}
