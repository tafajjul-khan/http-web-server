document.getElementById('startBtn').addEventListener('click', () => {
    const bar = document.getElementById('progress-bar');
    let width = 0;
    
    // Simulating data loading from your custom server
    const interval = setInterval(() => {
        if (width >= 100) {
            clearInterval(interval);
            alert("Data successfully served from your Node.js Server!");
        } else {
            width += 10;
            bar.style.width = width + '%';
        }
    }, 300);
});