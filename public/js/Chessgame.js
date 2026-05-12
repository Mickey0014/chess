const socket = io();

const boardElement = document.querySelector("#chessboard");
const statusElement = document.querySelector("#status");
const roleElement = document.querySelector("#role");
const playersElement = document.querySelector("#players");
const messageElement = document.querySelector("#message");
const resetButton = document.querySelector("#reset");
const flipButton = document.querySelector("#flip");
const playWhiteButton = document.querySelector("#play-white");
const playBlackButton = document.querySelector("#play-black");
const watchButton = document.querySelector("#watch");

const pieces = {
    wp: "\u2659",
    wr: "\u2656",
    wn: "\u2658",
    wb: "\u2657",
    wq: "\u2655",
    wk: "\u2654",
    bp: "\u265F",
    br: "\u265C",
    bn: "\u265E",
    bb: "\u265D",
    bq: "\u265B",
    bk: "\u265A",
};

let board = parseFen("start");
let playerRole = null;
let selectedSquare = null;
let draggedSquare = null;
let lastMove = null;
let flippedByUser = false;
let gameTurn = "w";
let occupiedSeats = { white: false, black: false };

function parseFen(fen) {
    const placement = fen === "start"
        ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
        : fen.split(" ")[0];

    return placement.split("/").map((rank) => {
        const row = [];

        for (const char of rank) {
            if (/\d/.test(char)) {
                row.push(...Array(Number(char)).fill(null));
            } else {
                row.push({
                    color: char === char.toUpperCase() ? "w" : "b",
                    type: char.toLowerCase(),
                });
            }
        }

        return row;
    });
}

function squareName(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function visibleSquares() {
    const squares = [];

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            squares.push({ row, col });
        }
    }

    const shouldFlip = (playerRole === "b") !== flippedByUser;
    return shouldFlip ? squares.reverse() : squares;
}

function canMovePiece(piece) {
    return piece && playerRole && piece.color === playerRole && gameTurn === playerRole;
}

function clearMessageSoon() {
    window.clearTimeout(clearMessageSoon.timeoutId);
    clearMessageSoon.timeoutId = window.setTimeout(() => {
        messageElement.textContent = "";
    }, 2800);
}

function setTemporaryMessage(message) {
    messageElement.textContent = message;
    clearMessageSoon();
}

function updateRole(role) {
    playerRole = role;
    roleElement.textContent = role === "w" ? "White" : role === "b" ? "Black" : "Spectator";
    resetButton.disabled = !role;
}

function updatePlayers(players) {
    occupiedSeats = players;
    const count = Number(Boolean(players.white)) + Number(Boolean(players.black));
    playersElement.textContent = `${count} / 2`;
    playWhiteButton.disabled = players.white && playerRole !== "w";
    playBlackButton.disabled = players.black && playerRole !== "b";
}

function renderBoard() {
    boardElement.innerHTML = "";

    visibleSquares().forEach(({ row, col }) => {
        const square = squareName(row, col);
        const piece = board[row][col];
        const squareElement = document.createElement("div");

        squareElement.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
        squareElement.dataset.square = square;
        squareElement.setAttribute("role", "button");
        squareElement.setAttribute("aria-label", square);

        if (selectedSquare === square) {
            squareElement.classList.add("selected");
        }

        if (lastMove && (lastMove.from === square || lastMove.to === square)) {
            squareElement.classList.add("last-move");
        }

        squareElement.addEventListener("click", () => handleSquareClick(square, piece));
        squareElement.addEventListener("dragover", (event) => event.preventDefault());
        squareElement.addEventListener("drop", (event) => {
            event.preventDefault();

            if (draggedSquare) {
                requestMove(draggedSquare, square);
            }
        });

        if (piece) {
            const pieceElement = document.createElement("button");
            pieceElement.type = "button";
            pieceElement.className = `piece ${piece.color === "w" ? "white" : "black"}`;
            pieceElement.textContent = pieces[`${piece.color}${piece.type}`];
            pieceElement.draggable = Boolean(canMovePiece(piece));
            pieceElement.setAttribute("aria-label", `${piece.color === "w" ? "White" : "Black"} ${piece.type}`);

            if (pieceElement.draggable) {
                pieceElement.classList.add("playable");
            }

            pieceElement.addEventListener("dragstart", (event) => {
                if (!canMovePiece(piece)) {
                    event.preventDefault();
                    return;
                }

                draggedSquare = square;
                selectedSquare = square;
                pieceElement.classList.add("dragging");
                event.dataTransfer.setData("text/plain", square);
            });

            pieceElement.addEventListener("dragend", () => {
                draggedSquare = null;
                pieceElement.classList.remove("dragging");
                renderBoard();
            });

            squareElement.appendChild(pieceElement);
        }

        boardElement.appendChild(squareElement);
    });
}

function handleSquareClick(square, piece) {
    if (selectedSquare) {
        if (selectedSquare === square) {
            selectedSquare = null;
            renderBoard();
            return;
        }

        requestMove(selectedSquare, square);
        return;
    }

    if (piece && playerRole && piece.color === playerRole && gameTurn !== playerRole) {
        setTemporaryMessage("Wait for your turn.");
        return;
    }

    if (piece && piece.color !== playerRole) {
        setTemporaryMessage(playerRole ? "You can only move your own pieces." : "Choose a seat to play.");
        return;
    }

    if (canMovePiece(piece)) {
        selectedSquare = square;
        renderBoard();
    }
}

function requestMove(from, to) {
    if (!playerRole) {
        setTemporaryMessage("Choose White or Black before moving.");
        return;
    }

    selectedSquare = null;
    socket.emit("move", { from, to, promotion: "q" });
}

socket.on("role", (role) => {
    updateRole(role);
    renderBoard();
});

socket.on("gameState", (state) => {
    board = parseFen(state.fen);
    gameTurn = state.turn;
    if (Object.prototype.hasOwnProperty.call(state, "lastMove")) {
        lastMove = state.lastMove;
    }
    selectedSquare = null;
    statusElement.textContent = state.status.message;
    updatePlayers(state.players);
    renderBoard();

    if (state.status.gameOver) {
        setTemporaryMessage(state.status.message);
    }
});

socket.on("moveRejected", (message) => {
    selectedSquare = null;
    setTemporaryMessage(message);
    renderBoard();
});

socket.on("connect", () => {
    statusElement.textContent = "Connected. Waiting for game state...";
});

socket.on("disconnect", () => {
    statusElement.textContent = "Disconnected. Reconnecting...";
});

resetButton.addEventListener("click", () => {
    socket.emit("resetGame");
});

flipButton.addEventListener("click", () => {
    flippedByUser = !flippedByUser;
    renderBoard();
});

playWhiteButton.addEventListener("click", () => {
    socket.emit("claimRole", "w");
});

playBlackButton.addEventListener("click", () => {
    socket.emit("claimRole", "b");
});

watchButton.addEventListener("click", () => {
    socket.emit("claimRole", null);
});

updateRole(null);
updatePlayers(occupiedSeats);
renderBoard();
