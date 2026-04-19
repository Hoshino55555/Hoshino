import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import InnerScreen from './InnerScreen';

interface StarburstProps {
    onBack: () => void;
}

type CellValue = 0 | 1 | 2 | 3;
type GameStatus = 'playing' | 'won' | 'lost';

interface GridCell {
    value: CellValue;
    flipped: boolean;
}

interface RowHint {
    sum: number;
    starCount: number;
}

const GRID_SIZE = 5;

const Starburst: React.FC<StarburstProps> = ({ onBack }) => {
    const [grid, setGrid] = useState<GridCell[][]>([]);
    const [rowHints, setRowHints] = useState<RowHint[]>([]);
    const [colHints, setColHints] = useState<RowHint[]>([]);
    const [score, setScore] = useState<number>(1);
    const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
    const [isClosing, setIsClosing] = useState(false);

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

                newGrid[i][j] = { value, flipped: false };
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

        const newGrid = grid.map(r => r.map(c => ({ ...c })));
        newGrid[row][col].flipped = true;

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
    };

    const handleBack = () => {
        if (isClosing) return;
        setIsClosing(true);
    };

    const getCellDisplay = (cell: GridCell): string => {
        if (!cell.flipped) return '?';
        if (cell.value === 0) return '⭐';
        return cell.value.toString();
    };

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
        <InnerScreen
            expanded
            animateIn
            exiting={isClosing}
            onExitComplete={onBack}
            showBackgroundImage={false}
            leftButtonText=""
            centerButtonText=""
            rightButtonText=""
            onLeftButtonPress={handleBack}
            onRightButtonPress={handleNewGame}
        >
            <View style={styles.content}>
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
                                    <Text style={styles.cellText}>{getCellDisplay(cell)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                </View>

                <Text style={styles.instructionText}>
                    Flip all 2s and 3s. Avoid Stars!
                </Text>
            </View>
        </InnerScreen>
    );
};

const { width } = Dimensions.get('window');
const CELL_SIZE = Math.min((width - 100) / (GRID_SIZE + 1), 42);

const styles = StyleSheet.create({
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    title: {
        fontSize: 16,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        marginBottom: 8,
    },
    scoreContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    scoreLabel: {
        fontSize: 10,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        marginRight: 8,
    },
    scoreValue: {
        fontSize: 14,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
        fontSize: 12,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
    },
    loseMessage: {
        fontSize: 12,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
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
        fontSize: 10,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    hintStar: {
        fontSize: 8,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
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
        fontSize: 14,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    instructionText: {
        fontSize: 8,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        textAlign: 'center',
        marginTop: 4,
    },
});

export default Starburst;
