const express = require("express");
const app = express();
const path = require("path");
const { exec, spawn } = require("child_process");
const fs = require("fs");

app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req,res)=>{
    res.render("camera");
});

let latestFrame = null;

app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Pragma': 'no-cache'
    });

    // libcamera-vid + ffmpeg をパイプラインで実行
    cameraProcess = spawn('bash', ['-c', `
    libcamera-vid --nopreview --codec yuv420 --width 1920 --height 1080 --framerate 30 --timeout 0 --output - |
    ffmpeg -f rawvideo -pix_fmt yuv420p -s 1920x1080 -r 30 -i - -f mjpeg -
  `]);

    let buffer = Buffer.alloc(0);

    cameraProcess.stdout.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);

        // JPEGフレームの先頭と末尾を探す
        let start = buffer.indexOf(Buffer.from([0xFF, 0xD8])); // SOI
        let end = buffer.indexOf(Buffer.from([0xFF, 0xD9]));   // EOI

        while (start !== -1 && end !== -1 && end > start) {
            const frame = buffer.slice(start, end + 2);
            latestFrame = frame;

            res.write(`--frame\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${frame.length}\r\n\r\n`);
            res.write(frame);
            res.write('\r\n');

            buffer = buffer.slice(end + 2);
            start = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
            end = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
        }
    });

    cameraProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    req.on('close', () => {
        console.log('Client disconnected');
        if (cameraProcess) {
            cameraProcess.kill();
            cameraProcess = null;
        }
    });
});

app.get("/photo", (req,res)=>{

    if(!latestFrame) return res.status(500).send("フレーム未取得");
    const filename = `photo_${Date.now()}.jpg`;
    const filePath = path.join(__dirname, "public", "photos", filename);
    //保存
    fs.writeFileSync(filePath, latestFrame);
    res.json({ url: `/photos/${filename}` });
});

// 動画録画開始
app.get("/video/start", (req, res) => {
  if (videoProcess) return res.send("録画中です");
  const filename = `video_${Date.now()}.h264`;
  const filePath = path.join(__dirname, "public", "videos", filename);

  videoProcess = spawn("libcamera-vid", [
    "--width", "1280",
    "--height", "720",
    "--framerate", "30",
    "--timeout", "0",
    "--output", filePath
  ]);

  videoProcess.stderr.on("data", (data) => console.error("Video ERR:", data.toString()));
  videoProcess.on("close", () => { videoProcess = null; });
  res.send(`録画開始: ${filename}`);
});

// 動画録画停止
app.get("/video/stop", (req, res) => {
  if (!videoProcess) return res.send("録画中ではありません");
  videoProcess.kill();
  videoProcess = null;
  res.send("録画停止");
});


app.listen(3000, ()=>{
    console.log("ポート3000で待受け中");
});