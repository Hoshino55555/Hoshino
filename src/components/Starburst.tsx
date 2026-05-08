import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface StarburstProps {
    onBack: () => void;
    // Fired exactly once per finished round, with the win/loss outcome — wires
    // into the bonding-streak meters (10 plays drains energy, 5 wins lifts
    // mood). Backing out mid-round does not fire this.
    onGameEnd?: (won: boolean) => void;
}

type CellValue = 0 | 1 | 2 | 3;
type GameStatus = 'playing' | 'won' | 'lost';
// 'flip' is the destructive action; the rest are sudoku-style scratch
// marks the player toggles to track their guesses without committing.
type InputMode = 'flip' | 'note-bomb' | 'note-1' | 'note-2' | 'note-3';

interface CellNotes {
    bomb: boolean;
    n1: boolean;
    n2: boolean;
    n3: boolean;
}

interface GridCell {
    value: CellValue;
    flipped: boolean;
    notes: CellNotes;
}

const EMPTY_NOTES: CellNotes = { bomb: false, n1: false, n2: false, n3: false };
const NOTE_KEY: Record<Exclude<InputMode, 'flip'>, keyof CellNotes> = {
    'note-bomb': 'bomb',
    'note-1': 'n1',
    'note-2': 'n2',
    'note-3': 'n3',
};

interface RowHint {
    sum: number;
    starCount: number;
}

const GRID_SIZE = 5;

const Starburst: React.FC<StarburstProps> = ({ onBack, onGameEnd }) => {
    const insets = useSafeAreaInsets();
    const [grid, setGrid] = useState<GridCell[][]>([]);
    const [rowHints, setRowHints] = useState<RowHint[]>([]);
    const [colHints, setColHints] = useState<RowHint[]>([]);
    const [score, setScore] = useState<number>(1);
    const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
    const [inputMode, setInputMode] = useState<InputMode>('flip');

    const generateGrid = useCallback((): GridCell[][] => {
        const newGrid: GridCell[][] = [];

        for (let i = 0; i < GRID_SIZE; i++) {
            newGrid[i] = [];
            for (let j = 0; j < GRID_SIZE; j++) {
                const rand = Math.random();
                let value: CellValue;
                if (rand < 0.35) value = 1;
                else if (rand < 0.6) value = 2;
                else if (rand < 0.85) value = 3;
                else value = 0;

                newGrid[i][j] = { value, flipped: false, notes: { ...EMPTY_NOTES } };
            }
        }

        let starCount = 0;
        let valuableCount = 0;
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                if (newGrid[i][j].value === 0) starCount++;
                if (newGrid[i][j].value === 2 || newGrid[i][j].value === 3) valuableCount++;
            }
        }

        if (starCount < 3) {
            let added = 0;
            while (starCount + added < 3 && added < 5) {
                const row = Math.floor(Math.random() * GRID_SIZE);
                const col = Math.floor(Math.random() * GRID_SIZE);
                if (newGrid[row][col].value === 1) {
                    newGrid[row][col].value = 0;
                    added++;
                }
            }
        }

        if (valuableCount < 8) {
            let added = 0;
            while (valuableCount + added < 8 && added < 7) {
                const row = Math.floor(Math.random() * GRID_SIZE);
                const col = Math.floor(Math.random() * GRID_SIZE);
                if (newGrid[row][col].value === 1) {
                    newGrid[row][col].value = Math.random() < 0.5 ? 2 : 3;
                    added++;
                }
            }
        }

        const newRowHints: RowHint[] = [];
        const newColHints: RowHint[] = [];

        for (let i = 0; i < GRID_SIZE; i++) {
            let rowSum = 0;
            let rowStars = 0;
            let colSum = 0;
            let colStars = 0;

            for (let j = 0; j < GRID_SIZE; j++) {
                if (newGrid[i][j].value === 0) {
                    rowStars++;
                } else {
                    rowSum += newGrid[i][j].value;
                }

                if (newGrid[j][i].value === 0) {
                    colStars++;
                } else {
                    colSum += newGrid[j][i].value;
                }
            }

            newRowHints.push({ sum: rowSum, starCount: rowStars });
            newColHints.push({ sum: colSum, starCount: colStars });
        }

        setRowHints(newRowHints);
        setColHints(newColHints);

        return newGrid;
    }, []);

    useEffect(() => {
        const newGrid = generateGrid();
        setGrid(newGrid);
        setScore(1);
        setGameStatus('playing');
    }, []);

    // Fire the bonding callback exactly when a round ends. handleNewGame flips
    // status back to 'playing' which is a no-op here, so each won/lost
    // transition reports once.
    useEffect(() => {
        if (gameStatus === 'won') onGameEnd?.(true);
        else if (gameStatus === 'lost') onGameEnd?.(false);
    }, [gameStatus]);

    const checkWinCondition = useCallback((currentGrid: GridCell[][]): boolean => {
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                const cell = currentGrid[i][j];
                if ((cell.value === 2 || cell.value === 3) && !cell.flipped) {
                    return false;
                }
            }
        }
        return true;
    }, []);

    const handleCellPress = (row: number, col: number) => {
        if (gameStatus !== 'playing') return;
        if (grid[row][col].flipped) return;

        // Note mode: toggle the corresponding mark on/off; never reveals.
        // Notes are wiped when a cell is later flipped — they're scratch.
        if (inputMode !== 'flip') {
            const key = NOTE_KEY[inputMode];
            setGrid((prev) =>
                prev.map((r, ri) =>
                    r.map((c, ci) =>
                        ri === row && ci === col
                            ? { ...c, notes: { ...c.notes, [key]: !c.notes[key] } }
                            : c,
                    ),
                ),
            );
            return;
        }

        const newGrid = grid.map(r => r.map(c => ({ ...c, notes: { ...c.notes } })));
        newGrid[row][col].flipped = true;
        newGrid[row][col].notes = { ...EMPTY_NOTES };

        const cellValue = newGrid[row][col].value;

        if (cellValue === 0) {
            setGameStatus('lost');
            setGrid(newGrid);
        } else {
            setScore(prev => prev * cellValue);
            setGrid(newGrid);

            if (checkWinCondition(newGrid)) {
                setGameStatus('won');
            }
        }
    };

    const handleNewGame = () => {
        const newGrid = generateGrid();
        setGrid(newGrid);
        setScore(1);
        setGameStatus('playing');
        setInputMode('flip');
    };

    const handleBack = () => {
        onBack();
    };

    const renderCellContent = (cell: GridCell) => {
        if (cell.flipped) {
            const text = cell.value === 0 ? '⭐' : cell.value.toString();
            return <Text style={styles.cellText}>{text}</Text>;
        }
        const hasNotes =
            cell.notes.bomb || cell.notes.n1 || cell.notes.n2 || cell.notes.n3;
        if (!hasNotes) return <Text style={styles.cellText}>?</Text>;
        // 2x2 corner layout matching the toolbar order: bomb, 1, 2, 3.
        return (
            <View style={styles.notesGrid}>
                <View style={styles.notesRow}>
                    <Text style={styles.noteText}>{cell.notes.bomb ? '⭐' : ' '}</Text>
                    <Text style={styles.noteText}>{cell.notes.n1 ? '1' : ' '}</Text>
                </View>
                <View style={styles.notesRow}>
                    <Text style={styles.noteText}>{cell.notes.n2 ? '2' : ' '}</Text>
                    <Text style={styles.noteText}>{cell.notes.n3 ? '3' : ' '}</Text>
                </View>
            </View>
        );
    };

    const MODE_BUTTONS: Array<{ mode: InputMode; label: string }> = [
        { mode: 'flip', label: 'Flip' },
        { mode: 'note-bomb', label: '⭐' },
        { mode: 'note-1', label: '1' },
        { mode: 'note-2', label: '2' },
        { mode: 'note-3', label: '3' },
    ];

    const getCellStyle = (cell: GridCell) => {
        if (!cell.flipped) {
            return [styles.cell, styles.cellHidden];
        }
        if (cell.value === 0) {
            return [styles.cell, styles.cellStar];
        }
        return [styles.cell, styles.cellFlipped];
    };

    return (
        <View style={[StyleSheet.absoluteFill, styles.screenBg]}>
            <View style={[styles.content, { paddingBottom: insets.bottom + 60 }]}>
                <Text style={styles.title}>Starburst</Text>

                <View style={styles.scoreContainer}>
                    <Text style={styles.scoreLabel}>Score:</Text>
                    <Text style={styles.scoreValue}>{score}</Text>
                </View>

                {gameStatus === 'won' && (
                    <View style={styles.messageContainer}>
                        <Text style={styles.winMessage}>You Win! 🎉</Text>
                    </View>
                )}

                {gameStatus === 'lost' && (
                    <View style={styles.messageContainer}>
                        <Text style={styles.loseMessage}>Game Over! ⭐</Text>
                    </View>
                )}

                <View style={styles.gameBoard}>
                    <View style={styles.hintRow}>
                        <View style={styles.cornerCell} />
                        {colHints.map((hint, idx) => (
                            <View key={idx} style={styles.hintCell}>
                                <Text style={styles.hintSum}>{hint.sum}</Text>
                                <Text style={styles.hintStar}>{hint.starCount}</Text>
                            </View>
                        ))}
                    </View>

                    {grid.map((row, rowIdx) => (
                        <View key={rowIdx} style={styles.gridRow}>
                            <View style={styles.hintCell}>
                                <Text style={styles.hintSum}>{rowHints[rowIdx]?.sum || 0}</Text>
                                <Text style={styles.hintStar}>{rowHints[rowIdx]?.starCount || 0}</Text>
                            </View>

                            {row.map((cell, colIdx) => (
                                <TouchableOpacity
                                    key={colIdx}
                                    style={getCellStyle(cell)}
                                    onPress={() => handleCellPress(rowIdx, colIdx)}
                                    disabled={gameStatus !== 'playing' || cell.flipped}
                                >
                                    {renderCellContent(cell)}
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                </View>

                <View style={styles.modeBar}>
                    {MODE_BUTTONS.map(({ mode, label }) => {
                        const active = inputMode === mode;
                        return (
                            <TouchableOpacity
                                key={mode}
                                style={[styles.modeButton, active && styles.modeButtonActive]}
                                onPress={() => setInputMode(mode)}
                                disabled={gameStatus !== 'playing'}
                            >
                                <Text
                                    style={[
                                        styles.modeButtonText,
                                        active && styles.modeButtonTextActive,
                                    ]}
                                >
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={styles.instructionText}>
                    Flip all 2s and 3s. Avoid Stars!
                </Text>

                <TouchableOpacity
                    style={styles.newGameButton}
                    onPress={handleNewGame}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                    <Text style={styles.newGameButtonText}>New Game</Text>
                </TouchableOpacity>
            </View>

            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
                <TouchableOpacity
                    style={styles.topButton}
                    onPress={handleBack}
                    hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                >
                    <Text style={styles.topButtonText}>{'<'} Back</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const { width } = Dimensions.get('window');
// Board grows to fill the fullscreen overlay instead of the old InnerScreen
// cavity — cap at 64px so tablets don't get a giant grid, otherwise let phones
// use the whole width minus margins.
const CELL_SIZE = Math.min((width - 48) / (GRID_SIZE + 1), 64);

const styles = StyleSheet.create({
    // Solid backdrop so the game doesn't bleed onto the prior route's art —
    // matches Profile's safeArea tone and keeps the dark-green title legible.
    screenBg: {
        backgroundColor: '#E8F5E8',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    topButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(46, 90, 62, 0.85)',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#E8F5E8',
    },
    topButtonText: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 14,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    title: {
        fontSize: 22,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        marginBottom: 8,
    },
    scoreContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    scoreLabel: {
        fontSize: 14,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        marginRight: 8,
    },
    scoreValue: {
        fontSize: 20,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    messageContainer: {
        backgroundColor: '#2E5A3E',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginBottom: 8,
        alignItems: 'center',
    },
    winMessage: {
        fontSize: 17,
        color: '#E8F5E8',
        fontFamily: 'Monaco',
    },
    loseMessage: {
        fontSize: 17,
        color: '#E8F5E8',
        fontFamily: 'Monaco',
    },
    gameBoard: {
        alignItems: 'center',
        marginBottom: 10,
    },
    hintRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    gridRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    cornerCell: {
        width: CELL_SIZE,
        height: CELL_SIZE,
    },
    hintCell: {
        width: CELL_SIZE,
        height: CELL_SIZE,
        backgroundColor: '#D4E8D4',
        borderWidth: 2,
        borderColor: '#2E5A3E',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 2,
    },
    hintSum: {
        fontSize: 14,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    hintStar: {
        fontSize: 11,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    cell: {
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderWidth: 2,
        borderColor: '#2E5A3E',
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 2,
    },
    cellHidden: {
        backgroundColor: '#B8D4B8',
    },
    cellFlipped: {
        backgroundColor: '#E8F5E8',
    },
    cellStar: {
        backgroundColor: '#FF6B6B',
    },
    cellText: {
        fontSize: 20,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
    },
    notesGrid: {
        flex: 1,
        alignSelf: 'stretch',
        paddingVertical: 2,
        paddingHorizontal: 2,
    },
    notesRow: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    noteText: {
        fontSize: 11,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        textAlign: 'center',
        minWidth: 8,
    },
    modeBar: {
        flexDirection: 'row',
        marginTop: 10,
        gap: 6,
    },
    modeButton: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: '#D4E8D4',
        borderWidth: 2,
        borderColor: '#2E5A3E',
        borderRadius: 6,
        minWidth: 36,
        alignItems: 'center',
    },
    modeButtonActive: {
        backgroundColor: '#2E5A3E',
    },
    modeButtonText: {
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        fontSize: 14,
    },
    modeButtonTextActive: {
        color: '#E8F5E8',
    },
    instructionText: {
        fontSize: 11,
        color: '#2E5A3E',
        fontFamily: 'Monaco',
        textAlign: 'center',
        marginTop: 4,
    },
    newGameButton: {
        marginTop: 16,
        paddingVertical: 14,
        paddingHorizontal: 32,
        backgroundColor: '#2E5A3E',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#E8F5E8',
        alignSelf: 'center',
    },
    newGameButtonText: {
        color: '#E8F5E8',
        fontFamily: 'Monaco',
        fontSize: 20,
        textAlign: 'center',
    },
});

export default Starburst;
