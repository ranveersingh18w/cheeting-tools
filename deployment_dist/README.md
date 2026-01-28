# MCQ AI Server

A Node.js server that receives MCQ screenshots from the Chrome extension and allows manual answer input through a web dashboard.

## Features

- 📸 **Image Upload API** - Extension sends MCQ screenshots
- 🎯 **Manual Answer Input** - Dashboard to view images and input answers (A/B/C/D)
- 📊 **Real-time Dashboard** - See all pending and completed requests
- 🔄 **Status Polling** - Extension can check when answer is ready

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000`

## API Endpoints

### 1. Upload Image
**POST** `/api/upload-image`
- Receives screenshot from extension
- Returns request ID
- Example:
```javascript
const formData = new FormData();
formData.append('image', imageFile);

fetch('http://localhost:3000/api/upload-image', {
  method: 'POST',
  body: formData
})
.then(res => res.json())
.then(data => console.log(data.requestId)); // req_1, req_2, etc.
```

### 2. Check Status
**GET** `/api/status/:requestId`
- Check if answer is available
- Example:
```javascript
fetch('http://localhost:3000/api/status/req_1')
  .then(res => res.json())
  .then(data => console.log(data.status)); // pending or completed
```

### 3. Get Answer
**GET** `/api/answer/:requestId`
- Get the answer (only available when status is completed)
- Returns 202 if pending, 200 if completed with answer
- Example:
```javascript
fetch('http://localhost:3000/api/answer/req_1')
  .then(res => res.json())
  .then(data => console.log(data.answer)); // A, B, C, or D
```

### 4. Submit Answer
**POST** `/api/submit-answer/:requestId`
- Submit the manual answer through UI
- Body: `{ "answer": "A" }` (A, B, C, or D)

### 5. Get All Requests
**GET** `/api/all-requests`
- Get list of all pending and completed requests
- Used by dashboard

### 6. Clear Completed Requests
**DELETE** `/api/clear-requests`
- Delete all completed requests
- Keeps pending requests

## How It Works

1. **Extension captures screenshot** → Sends to `/api/upload-image`
2. **Server stores request** → Returns unique request ID
3. **Dashboard shows pending image** → User manually enters answer
4. **Answer submitted** → Status changes to "completed"
5. **Extension polls** → Gets answer from `/api/answer/:requestId`
6. **Extension shows answer** → Displays on the page

## Extension Integration

The extension sends images like this:
```javascript
const formData = new FormData();
formData.append('image', imageBlob);

const response = await fetch('http://localhost:3000/api/upload-image', {
  method: 'POST',
  body: formData
});

const data = await response.json();
const requestId = data.requestId; // Store this

// Poll for answer
const checkAnswer = async () => {
  const answerResponse = await fetch(`http://localhost:3000/api/answer/${requestId}`);
  if (answerResponse.status === 200) {
    const answerData = await answerResponse.json();
    console.log('Answer:', answerData.answer); // A, B, C, or D
  } else {
    // Still pending, check again later
    setTimeout(checkAnswer, 1000);
  }
};

checkAnswer();
```

## Configuration

- **PORT**: Default is 3000, can be set via `PORT` environment variable
- **Image Limit**: 50MB max file size
- **Server Storage**: In-memory (requests cleared on server restart)

## Development

For development with auto-reload:
```bash
npm install -D nodemon
npx nodemon server.js
```
