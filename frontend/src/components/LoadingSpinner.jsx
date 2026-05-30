export default function LoadingSpinner({ label = 'Loading...', inline = false }) {
  return (
    <div className={inline ? 'dash-loading-inline' : 'page center dash-loading'}>
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}
