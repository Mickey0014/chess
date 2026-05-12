require('dotenv').config();
const express = require("express");
const socketIo = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const chess = new Chess();
const players = {
    white: null,
    black: null,
};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index", { title: "Chess Game" });
});

function getRole(socketId) {
    if (players.white === socketId) return "w";
    if (players.black === socketId) return "b";
    return null;
}

function getPlayerCounts() {
    return {
        white: Boolean(players.white),
        black: Boolean(players.black),
    };
}

function buildStatus() {
    const turn = chess.turn() === "w" ? "White" : "Black";

    if (chess.isCheckmate()) {
        return {
            gameOver: true,
            message: `Checkmate. ${turn === "White" ? "Black" : "White"} wins.`,
        };
    }

    if (chess.isStalemate()) {
        return { gameOver: true, message: "Draw by stalemate." };
    }

    if (chess.isThreefoldRepetition()) {
        return { gameOver: true, message: "Draw by threefold repetition." };
    }

    if (chess.isInsufficientMaterial()) {
        return { gameOver: true, message: "Draw by insufficient material." };
    }

    if (chess.isDraw()) {
        return { gameOver: true, message: "Draw." };
    }

    return {
        gameOver: false,
        message: chess.isCheck() ? `${turn} to move. Check.` : `${turn} to move.`,
    };
}

function buildGameState(extra = {}) {
    return {
        fen: chess.fen(),
        turn: chess.turn(),
        players: getPlayerCounts(),
        status: buildStatus(),
        ...extra,
    };
}

function sendRole(socket) {
    if (!players.white) {
        players.white = socket.id;
        socket.emit("role", "w");
        return;
    }

    if (!players.black) {
        players.black = socket.id;
        socket.emit("role", "b");
        return;
    }

    socket.emit("role", null);
}

function claimRole(socket, requestedRole) {
    const currentRole = getRole(socket.id);

    if (!["w", "b"].includes(requestedRole)) {
        clearRole(socket.id);
        socket.emit("role", null);
        return true;
    }

    const seat = requestedRole === "w" ? "white" : "black";

    if (players[seat] && players[seat] !== socket.id) {
        socket.emit("moveRejected", `${seat[0].toUpperCase() + seat.slice(1)} is already taken.`);
        return false;
    }

    if (currentRole && currentRole !== requestedRole) {
        clearRole(socket.id);
    }

    players[seat] = socket.id;
    socket.emit("role", requestedRole);
    return true;
}

function clearRole(socketId) {
    if (players.white === socketId) {
        players.white = null;
    }

    if (players.black === socketId) {
        players.black = null;
    }
}

io.on("connection", function (socket) {
    console.log("connected", socket.id);

    sendRole(socket);
    socket.emit("gameState", buildGameState());
    socket.broadcast.emit("gameState", buildGameState());

    socket.on("disconnect", function () {
        clearRole(socket.id);
        io.emit("gameState", buildGameState());
    });

    socket.on("claimRole", (role) => {
        if (claimRole(socket, role)) {
            io.emit("gameState", buildGameState());
        }
    });

    socket.on("move", (move) => {
        try {
            const role = getRole(socket.id);

            if (!role) {
                socket.emit("moveRejected", "Spectators cannot move pieces.");
                return;
            }

            if (chess.turn() !== role) {
                socket.emit("moveRejected", "It is not your turn.");
                return;
            }

            const result = chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || "q",
            });

            if (result) {
                io.emit("gameState", buildGameState({ lastMove: { from: result.from, to: result.to } }));
            } else {
                socket.emit("moveRejected", "That move is not legal.");
            }
        } catch (err) {
            console.log("Invalid move:", move, err.message);
            socket.emit("moveRejected", "That move is not legal.");
        }
    });

    socket.on("resetGame", () => {
        const role = getRole(socket.id);

        if (!role) {
            socket.emit("moveRejected", "Only a player can reset the game.");
            return;
        }

        chess.reset();
        io.emit("gameState", buildGameState({ lastMove: null }));
    });
});

const port = process.env.PORT || 3000;
server.listen(port, function () {
    console.log(`listening on port ${port}`);
});
