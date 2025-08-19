const express = require("express");
const app = express();
const path = require("path");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true }));

function startGStreamer(){
    const gst = spawn("gst-launch-1.0",[
        "-v",
        "libcamerasrc",
        "!", "videoconvert",
        "!", "vp8enc", "deadline=1",
        "!", "rtpvp8pay",
        "!", "webrtcbin", "name=sendrecv", "stun-server=stun://stun.l.google.com:19302"
    ]);

    gst.stdout.on("data", data => console.log("GStreamer:", data.toString()));
    gst.stderr.on("data", data => console.error("GStreamer ERR:", data.toString()));
    gst.on("close", code => console.log("GStreamer exited with code", code));

    return gst;
}

const gstProcess = startGStreamer();

app.get("/", (req,res)=>{
    res.render("camera");
});

io.on("connection", socket=>{
    console.log("Client connected");
    socket.on("offer",(sdp)=>{
        socket.emit("answer", sdp);
    });

    socket.on("ice-candidate", (candidate)=>{
        socket.broadcast.emit("ice-candidate", candidate);
    });

    socket.on("disconnect", ()=>{
        console.log("client disconnected");
    });
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


server.listen(3000, ()=>{
    console.log("ポート3000で待受け中");
});