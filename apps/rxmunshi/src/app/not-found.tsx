import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="center">
      <div className="win rg" style={{ width: 380 }}>
        <div className="tb"><span className="t">404.txt</span></div>
        <div className="body">
          <p className="p">This page does not exist.</p>
          <p style={{ marginTop: 10 }}><Link className="btn" href="/today">Go to Today ▸</Link></p>
        </div>
      </div>
    </div>
  );
}
