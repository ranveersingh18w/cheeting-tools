import { GoogleGenerativeAI } from '@google/generative-ai';
import { useState, useEffect } from 'react';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default function Home() {
  const [logs, setLogs] = useState([]);
  const [model, setModel] = useState('gemini-1.5-flash');
  const [loading, setLoading] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);

  // Poll for requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch('/api/process?action=list');
        const data = await res.json();
        if (data.requests) {
          // Only show pending or recently completed
          setLogs(data.requests);
        }
      } catch (e) {
        console.error("Fetch error", e);
      }
    };
    
    // Poll every 1 second
    const interval = setInterval(fetchRequests, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const handleSolve = async (id, method, value) => {
    setLoading(true);
    try {
        const payload = { id };
        
        if (method === 'manual') payload.answer = value;
        if (method === 'ai') payload.model = value;
        
        await fetch('/api/process?action=solve', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
    } catch (e) {
        alert('Error solving: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      background: '#0a0a0a',
      color: '#e0e0e0',
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      gap: '0'
    }}>
      {/* SIDEBAR */}
      <div style={{ background: '#111', borderRight: '1px solid #333', padding: '20px' }}>
        <h1 style={{ margin: '0 0 20px 0', color: '#00ff00', fontSize: '20px' }}>MCQ Command</h1>
        
        <div style={{ marginBottom: '20px' }}>
            <label style={{display:'block', fontSize:'12px', color:'#666', marginBottom:'5px'}}>ACTIVE MODEL</label>
            <select 
              value={model} 
              onChange={(e) => setModel(e.target.value)}
              style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
            >
              <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
              <option value="gemini-3-flash-preview">Gemini 3.0 Flash (Exp)</option>
            </select>
        </div>
        
        <div style={{ padding: '15px', background: '#222', borderRadius: '8px' }}>
            <h3 style={{margin:'0 0 10px 0', fontSize:'14px'}}>Stats</h3>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px', marginBottom:'5px'}}>
                <span>Pending</span>
                <span style={{color:'orange'}}>{logs.filter(l => l.status === 'pending').length}</span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px'}}>
                <span>Completed</span>
                <span style={{color:'#00ff00'}}>{logs.filter(l => l.status === 'completed').length}</span>
            </div>
        </div>
      </div>

      {/* WATCH FEED */}
      <div style={{ padding: '20px', overflowY: 'auto' }}>
        <h2 style={{marginTop:0}}>Live Feed</h2>
        
        {logs.length === 0 && <div style={{textAlign:'center', marginTop:'50px', color:'#444'}}>Waiting for requests from extension...</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {logs.map(req => (
                <div key={req.id} style={{ 
                    background: '#161616', 
                    borderRadius: '12px', 
                    padding: '15px',
                    border: req.status === 'pending' ? '1px solid #00ff00' : '1px solid #333',
                    opacity: req.status === 'completed' ? 0.6 : 1
                }}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                        <span style={{fontSize:'12px', color:'#888'}}>ID: {req.id}</span>
                        {req.status === 'pending' ? 
                            <span style={{background:'orange', color:'black', padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:'bold'}}>NEEDS ATTENTION</span> 
                            : 
                            <span style={{background:'#00ff00', color:'black', padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:'bold'}}>SOLVED: {req.answer}</span>
                        }
                    </div>

                    <div style={{display:'grid', gridTemplateColumns:'200px 1fr', gap:'20px'}}>
                        <img src={req.image} style={{width:'100%', borderRadius:'4px', border:'1px solid #333'}} />
                        
                        <div>
                            {req.status === 'pending' && (
                                <>
                                    <div style={{marginBottom:'15px'}}>
                                        <div style={{fontSize:'12px', color:'#666', marginBottom:'5px'}}>QUICK ACTIONS</div>
                                        <div style={{display:'flex', gap:'5px'}}>
                                            {['A','B','C','D'].map(letter => (
                                                <button 
                                                    key={letter}
                                                    onClick={() => handleSolve(req.id, 'manual', letter)}
                                                    style={{
                                                        padding: '10px 20px',
                                                        background: '#333',
                                                        border: '1px solid #555',
                                                        color: 'white',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '16px',
                                                        fontWeight: 'bold'
                                                    }}
                                                >
                                                    {letter}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div style={{fontSize:'12px', color:'#666', marginBottom:'5px'}}>AI ASSIST</div>
                                        <button 
                                            onClick={() => handleSolve(req.id, 'ai', model)}
                                            style={{
                                                padding: '10px 20px',
                                                background: '#0a4a0a',
                                                border: '1px solid #00ff00',
                                                color: '#00ff00',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                width: '100%',
                                                textAlign: 'left'
                                            }}
                                        >
                                            ⚡ Solve with {model}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  )
}
