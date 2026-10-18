import { useFeatures } from '../../features/FeaturesContext';
import { FEATURES } from '../../repo/features';

export default function FeaturesCard() {
  const { flags, set } = useFeatures();
  return (
    <div className="bcard">
      <span className="lbl2">Features</span>
      <p className="muted">Switch off anything you do not use. Turning a feature off only hides it; everything you saved stays and comes back when you turn it on again.</p>
      <ul className="featurelist">
        {FEATURES.map((f) => (
          <li key={f.key}>
            <label className="inline featurerow">
              <input type="checkbox" role="switch" checked={flags[f.key]} onChange={(e) => void set(f.key, e.target.checked)} aria-label={f.label} />
              <span><b>{f.label}</b><br /><span className="muted small">{f.description}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
