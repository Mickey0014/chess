const socket = typeof io === "function" ? io() : null;

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
const flashElement = document.querySelector("#flash");
const promotionElement = document.querySelector("#promotion");
const promotionButtons = document.querySelectorAll("[data-promotion]");

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
let pendingPromotion = null;
let lastStatusMessage = "";

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

function coordsFromSquare(square) {
    return {
        row: 8 - Number(square[1]),
        col: square.charCodeAt(0) - 97,
    };
}

function pieceAt(square) {
    const { row, col } = coordsFromSquare(square);
    return board[row]?.[col] || null;
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

function showFlash(message, type = "info") {
    window.clearTimeout(showFlash.timeoutId);
    flashElement.textContent = message;
    flashElement.className = `flash ${type} show`;
    showFlash.timeoutId = window.setTimeout(() => {
        flashElement.classList.remove("show");
    }, 2200);
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

        if (piece && piece.color === playerRole) {
            selectedSquare = square;
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

    if (!socket) {
        setTemporaryMessage("Real-time server is unavailable. Refresh the page.");
        return;
    }

    if (isPromotionMove(from, to)) {
        pendingPromotion = { from, to };
        showPromotionChoice();
        return;
    }

    emitMove({ from, to });
}

function emitMove(move) {
    selectedSquare = null;
    pendingPromotion = null;
    socket.emit("move", { promotion: "q", ...move });
}

function isPromotionMove(from, to) {
    const sourcePiece = pieceAt(from);

    if (!sourcePiece || sourcePiece.type !== "p") {
        return false;
    }

    return (sourcePiece.color === "w" && to[1] === "8") || (sourcePiece.color === "b" && to[1] === "1");
}

function showPromotionChoice() {
    const color = playerRole || "w";

    promotionButtons.forEach((button) => {
        const promotion = button.dataset.promotion;
        button.textContent = pieces[`${color}${promotion}`];
    });

    promotionElement.classList.add("show");
    showFlash("Choose promotion", "info");
}

function hidePromotionChoice() {
    promotionElement.classList.remove("show");
}

resetButton.addEventListener("click", () => {
    if (!socket) {
        setTemporaryMessage("Real-time server is unavailable. Refresh the page.");
        return;
    }

    socket.emit("resetGame");
});

flipButton.addEventListener("click", () => {
    flippedByUser = !flippedByUser;
    renderBoard();
});

promotionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (!pendingPromotion) {
            hidePromotionChoice();
            return;
        }

        hidePromotionChoice();
        emitMove({
            from: pendingPromotion.from,
            to: pendingPromotion.to,
            promotion: button.dataset.promotion,
        });
    });
});

playWhiteButton.addEventListener("click", () => {
    if (!socket) {
        setTemporaryMessage("Real-time server is unavailable. Refresh the page.");
        return;
    }

    socket.emit("claimRole", "w");
});

playBlackButton.addEventListener("click", () => {
    if (!socket) {
        setTemporaryMessage("Real-time server is unavailable. Refresh the page.");
        return;
    }

    socket.emit("claimRole", "b");
});

watchButton.addEventListener("click", () => {
    if (!socket) {
        setTemporaryMessage("Real-time server is unavailable. Refresh the page.");
        return;
    }

    socket.emit("claimRole", null);
});

updateRole(null);
updatePlayers(occupiedSeats);
renderBoard();

if (socket) {
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
            showFlash(state.status.message, "game-over");
            setTemporaryMessage(state.status.message);
        } else if (state.status.message.includes("Check") && state.status.message !== lastStatusMessage) {
            showFlash("Check!", "check");
        }

        lastStatusMessage = state.status.message;
    });

    socket.on("moveRejected", (message) => {
        selectedSquare = null;
        pendingPromotion = null;
        hidePromotionChoice();
        showFlash(message, "game-over");
        setTemporaryMessage(message);
        renderBoard();
    });

    socket.on("connect", () => {
        statusElement.textContent = "Connected. Waiting for game state...";
    });

    socket.on("connect_error", () => {
        statusElement.textContent = "Connection failed. Render may still be starting.";
    });

    socket.on("disconnect", () => {
        statusElement.textContent = "Disconnected. Reconnecting...";
    });
} else {
    statusElement.textContent = "Socket.IO script did not load.";
    setTemporaryMessage("Check the deployed /socket.io/socket.io.js route.");
}
