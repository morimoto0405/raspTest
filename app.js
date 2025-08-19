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

app.get("/stream", (req,res)=>{
    res.writeHead(200,{
       "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache",
        "Connection": "close", 
    });

    const cam = spawn("libcamera-jpeg",[
        "--width", "640",
        "--height", "480",
        "--framerate", "30",
        "--output", "-"
    ]);

    cam.stdout.on("data", (data)=>{
        res.write("--frame\r\nContent-Type: image/jpeg\r\n\r\n");
        res.write(data);
        res.write("\r\n");
    });

    cam.stderr.on("data", (data)=> console.error("Camera Err:", data.toString()));
    req.on("close", ()=> cam.kill());
});

app.get("/photo", (req,res)=>{
    const filename = `photo_${Date.now()}.jpg`;
    const filePath = path.join(__dirname, "public", "photos", filename);

    exec(`libcamera-still -o ${filePath} --width 1280 --height 720 -n`,(err)=>{
        if(err){
            console.error(err);
            return res.status(500).send("写真撮影に失敗しました");
        }
        res.json({ url: `/photos/${filename}` });
    });
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