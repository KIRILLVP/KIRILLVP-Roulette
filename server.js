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
    io.emit('updateOnline', io.engine.clientsCount);

    socket.on('findPartner', (data) => {
        // Если кто-то уже ждет и это не тот же самый сокет
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const partner = waitingPlayer;
            waitingPlayer = null;
            pairs[socket.id] = partner.id;
            pairs[partner.id] = socket.id;
            
            socket.emit('partnerFound', { peerId: partner.peerId, location: partner.location });
            io.to(partner.id).emit('partnerFound', { peerId: data.peerId, location: data.location });
        } else {
            // Если никого нет, встаем в очередь
            waitingPlayer = { id: socket.id, peerId: data.peerId, location: data.location };
        }
    });

    // Когда пользователь нажимает "Следующий" или "Завершить"
    socket.on('requestDisconnect', () => {
        const partnerId = pairs[socket.id];
        if (partnerId) {
            delete pairs[socket.id]; 
            delete pairs[partnerId];
            io.to(partnerId).emit('partnerLeft'); // Собеседник вылетает в меню
        }
        // Если игрок был в поиске (waitingPlayer), убираем его
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
        
        socket.emit('partnerLeft'); // Сам игрок тоже получает сигнал возврата в меню
    });

    socket.on('disconnect', () => {
        const partnerId = pairs[socket.id];
        if (partnerId) { 
            delete pairs[partnerId]; 
            io.to(partnerId).emit('partnerLeft'); 
        }
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
        io.emit('updateOnline', io.engine.clientsCount);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
