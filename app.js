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

app.get("/stream", (req,res)=>{
    res.writeHead(200, {
       "Content-Type": "multipart/x-mixed-replace; boundary=frame" 
    });

    const stream = spawn("libcamera-vid", [
    "--inline", "-t", "0", "--width", "640", "--height", "480", "--framerate", "25", "-o", "-"
  ]);

  stream.stdout.on("data", (data) => {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\n\r\n`);
    res.write(data);
    res.write("\r\n");
  });

  stream.on("close", () => res.end());
});

app.listen(3000, (req,res)=>{
    console.log("ポート3000で待受け中");
});