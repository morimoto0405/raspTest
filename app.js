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

app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'video/mp4',
        "Cache-Control": "no-cache",
    "Connection": "close"
    });

     // libcamera-vid で生H.264出力 → ffmpegでWebMに変換
  const camProcess = spawn("bash", ["-c", `
    libcamera-vid --nopreview --codec h264 --width 1280 --height 720 --framerate 30 --timeout 0 --output - |
    ffmpeg -i - -c:v copy -f webm -
  `]);
 camProcess.stdout.pipe(res);

  camProcess.stderr.on("data", data => {
    console.error("ffmpeg:", data.toString());
  });

  req.on("close", () => {
    camProcess.kill();
  });
});

app.listen(3000, (req,res)=>{
    console.log("ポート3000で待受け中");
});