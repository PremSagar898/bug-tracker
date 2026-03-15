import React, { useState } from 'react';
import './App.css';

function App() {
  const [page, setPage] = useState('/tester.html');

  return (
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      <nav style={{ display: 'flex', gap: 8, padding: '12px 16px', background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
        <button onClick={() => setPage('/tester.html')} style={{ padding: '8px 12px', cursor: 'pointer' }}>
          Tester
        </button>
        <button onClick={() => setPage('/admin.html')} style={{ padding: '8px 12px', cursor: 'pointer' }}>
          Admin
        </button>
        <button onClick={() => setPage('/developer.html')} style={{ padding: '8px 12px', cursor: 'pointer' }}>
          Developer
        </button>
        <button onClick={() => setPage('/login.html')} style={{ padding: '8px 12px', cursor: 'pointer' }}>
          Login
        </button>
      </nav>
      <iframe
        title="BugTracker"
        src={page}
        style={{ width: '100%', height: 'calc(100vh - 48px)', border: 0, flexGrow: 1 }}
      />
    </div>
  );
}

export default App;
