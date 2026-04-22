const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Настройка Peer-сервера
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp'
});

app.use('/peerjs', peerServer);
app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayer = null; 
let pairs = {}; 

io.on('connection', (socket) => {
    // Функция для обновления статуса онлайна и очереди
    const broadcastStatus = () => {
        io.emit('updateOnline', {
            total: io.engine.clientsCount,
            waiting: waitingPlayer ? 1 : 0
        });
    };

    broadcastStatus();

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
        broadcastStatus();
    });

    socket.on('requestDisconnect', (data) => {
        const partnerId = pairs[socket.id];
        if (partnerId) {
            delete pairs[socket.id]; 
            delete pairs[partnerId];
            // Отправляем собеседнику причину отключения
            io.to(partnerId).emit('partnerLeft', { reason: data.reason || 'Собеседник покинул чат' });
        }
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
        
        socket.emit('partnerLeft', { reason: null }); // Сам игрок уходит без уведомления себе
        broadcastStatus();
    });

    socket.on('disconnect', () => {
        const partnerId = pairs[socket.id];
        if (partnerId) { 
            delete pairs[partnerId]; 
            io.to(partnerId).emit('partnerLeft', { reason: 'Собеседник отключился (проблемы с сетью)' }); 
        }
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
        broadcastStatus();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
