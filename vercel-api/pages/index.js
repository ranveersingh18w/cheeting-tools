import { GoogleGenerativeAI } from '@google/generative-ai';
import { useState } from 'react';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default function Home() {
  const [logs, setLogs] = useState([]);
  const [model, setModel] = useState('gemini-1.5-flash');
  const [apiKey, setApiKey] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  
  // This function simulates receiving a request (in real app, this data would come from a DB or WebSocket)
  // For this v1, we will build the UI structure for you to expand.
  
  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif',
      background: '#0a0a0a',
      color: '#e0e0e0',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <header style={{ 
        borderBottom: '1px solid #333', 
        paddingBottom: '20px', 
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, color: '#00ff00', fontSize: '24px' }}>MCQ AI Dashboard 🟢</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#888' }}>Real-time Control Center</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#666' }}>
          Server: {typeof window !== 'undefined' ? window.location.hostname : 'Loading...'}<br/>
          Status: <span style={{ color: '#00ff00' }}>Active</span>
        </div>
      </header>
      
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
        
        {/* Settings Panel */}
        <div style={{ background: '#161616', padding: '20px', borderRadius: '12px', border: '1px solid #333' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>⚙️ Configuration</h2>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: '#aaa' }}>Active Model</label>
            <select 
              value={model} 
              onChange={(e) => setModel(e.target.value)}
              style={{ width: '100%', padding: '8px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
            >
              <option value="gemini-1.5-flash">Gemini 1.5 Flash (Recommended)</option>
              <option value="gemini-3-flash-preview">Gemini 3.0 Flash (Preview)</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: '#aaa' }}>Custom Prompt Override</label>
            <textarea 
              rows="4"
              placeholder="Default: You are a strict exam grading machine..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              style={{ width: '100%', padding: '8px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', resize: 'vertical', fontSize: '12px' }}
            />
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px', color: '#aaa' }}>API Key Override (Optional)</label>
            <input 
              type="password"
              placeholder="Use Default Env Var"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ width: '100%', padding: '8px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
            />
          </div>
          
          <button style={{ width: '100%', padding: '10px', background: '#00ff00', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
            Save Configuration
          </button>
        </div>
        
        {/* Live Requests Panel */}
        <div style={{ background: '#161616', padding: '20px', borderRadius: '12px', border: '1px solid #333', height: 'calc(100vh - 140px)', overflowY: 'auto' }}>
           <h2 style={{ marginTop: 0, fontSize: '18px', borderBottom: '1px solid #333', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
             <span>📡 Live Requests</span>
             <span style={{ fontSize: '12px', background: '#333', padding: '2px 8px', borderRadius: '10px' }}>Waiting for connection...</span>
           </h2>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
             <p>No active requests yet.</p>
             <p style={{ fontSize: '12px' }}>Requests from your extension will appear here.</p>
           </div>
           
           {/* Example of what a request item would look like (Hidden for now) */}
           {/* 
           <div style={{ background: '#222', borderRadius: '8px', padding: '15px', borderLeft: '4px solid #00ff00' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>REQ-1024</span>
                <span style={{ fontSize: '12px', color: '#888' }}>10:42:05 AM</span>
             </div>
             <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '15px' }}>
               <div style={{ background: '#000', height: '80px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#666' }}>Image Preview</div>
               <div>
                  <div style={{ marginBottom: '8px', fontSize: '13px' }}><strong>IP:</strong> 192.168.1.1</div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button style={{ padding: '5px 15px', background: '#444', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', border: '1px solid #555' }}>A</button>
                    <button style={{ padding: '5px 15px', background: '#00ff00', border: 'none', color: 'black', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>B</button>
                    <button style={{ padding: '5px 15px', background: '#444', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', border: '1px solid #555' }}>C</button>
                    <button style={{ padding: '5px 15px', background: '#444', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', border: '1px solid #555' }}>D</button>
                  </div>
               </div>
             </div>
           </div> 
           */}
           
        </div>
      </div>
    </div>
  )
}
