export default function Home() {
  return (
    <div style={{ 
      fontFamily: 'system-ui, sans-serif', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      background: '#0a0a0a',
      color: 'white'
    }}>
      <h1 style={{ color: '#00ff00' }}>MCQ AI API is Running 🟢</h1>
      <p>The backend is active and ready to process requests.</p>
      <div style={{ 
        background: '#333', 
        padding: '15px', 
        borderRadius: '8px', 
        marginTop: '20px',
        fontFamily: 'monospace'
      }}>
        POST /api/process
      </div>
    </div>
  )
}
