const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer'); // Добавили это
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Настройка своего Peer-сервера
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp'
});

app.use('/peerjs', peerServer); // Твой личный облачный путь
app.use(express.static(path.join(__dirname, 'public')));

// ОСТАЛЬНОЙ КОД SOCKET.IO (без изменений)...
let waitingPlayer = null; 
let pairs = {}; 

io.on('connection', (socket) => {
    io.emit('updateOnline', io.engine.clientsCount);

    socket.on('findPartner', (data) => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const partner = waitingPlayer;
            waitingPlayer = null;
            pairs[socket.id] = partner.id;
            pairs[partner.id] = socket.id;
            socket.emit('partnerFound', { peerId: partner.peerId, location: partner.location });
            io.to(partner.id).emit('partnerFound', { peerId: data.peerId, location: data.location });
        } else {
            waitingPlayer = { id: socket.id, peerId: data.peerId, location: data.location };
        }
    });

    socket.on('requestNext', () => {
        const partnerId = pairs[socket.id];
        if (partnerId) {
            delete pairs[socket.id]; delete pairs[partnerId];
            io.to(partnerId).emit('partnerLeft');
        }
        socket.emit('partnerLeft');
    });

    socket.on('disconnect', () => {
        const partnerId = pairs[socket.id];
        if (partnerId) { delete pairs[partnerId]; io.to(partnerId).emit('partnerLeft'); }
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
        io.emit('updateOnline', io.engine.clientsCount);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));
