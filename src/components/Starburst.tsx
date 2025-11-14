import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

interface StarburstProps {
    onBack: () => void;
}

type CellValue = 0 | 1 | 2 | 3; // 0 = Star, 1-3 = numbers
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

    // Generate a valid game grid with more challenge
    const generateGrid = useCallback((): GridCell[][] => {
        const newGrid: GridCell[][] = [];
        
        // Very challenging probabilities: even fewer 1s, more 2s/3s, more Stars
        // 35% chance of 1, 25% chance of 2, 25% chance of 3, 15% chance of 0 (Star)
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

        // Ensure high difficulty: at least 3 Stars total, and at least 8 squares with 2s or 3s
        let starCount = 0;
        let valuableCount = 0;
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                if (newGrid[i][j].value === 0) starCount++;
                if (newGrid[i][j].value === 2 || newGrid[i][j].value === 3) valuableCount++;
            }
        }

        // If not challenging enough, add more Stars and valuable squares
        if (starCount < 3) {
            // Add Stars to random positions
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

        // Ensure we have enough 2s and 3s to make it challenging
        if (valuableCount < 8) {
            let added = 0;
            while (valuableCount + added < 8 && added < 7) {
                const row = Math.floor(Math.random() * GRID_SIZE);
                const col = Math.floor(Math.random() * GRID_SIZE);
                if (newGrid[row][col].value === 1) {
                    // 50/50 chance of 2 or 3
                    newGrid[row][col].value = Math.random() < 0.5 ? 2 : 3;
                    added++;
                }
            }
        }

        // Calculate hints
        const newRowHints: RowHint[] = [];
        const newColHints: RowHint[] = [];

        for (let i = 0; i < GRID_SIZE; i++) {
            let rowSum = 0;
            let rowStars = 0;
            let colSum = 0;
            let colStars = 0;

            for (let j = 0; j < GRID_SIZE; j++) {
                // Row hints
                if (newGrid[i][j].value === 0) {
                    rowStars++;
                } else {
                    rowSum += newGrid[i][j].value;
                }

                // Col hints
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

    // Initialize game
    useEffect(() => {
        const newGrid = generateGrid();
        setGrid(newGrid);
        setScore(1);
        setGameStatus('playing');
    }, []);

    // Check win condition
    const checkWinCondition = useCallback((currentGrid: GridCell[][]): boolean => {
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                const cell = currentGrid[i][j];
                // If it's a 2 or 3, it must be flipped
                if ((cell.value === 2 || cell.value === 3) && !cell.flipped) {
                    return false;
                }
            }
        }
        return true;
    }, []);

    // Handle cell flip
    const handleCellPress = (row: number, col: number) => {
        if (gameStatus !== 'playing') return;
        if (grid[row][col].flipped) return;

        const newGrid = grid.map(r => r.map(c => ({ ...c })));
        newGrid[row][col].flipped = true;

        const cellValue = newGrid[row][col].value;

        if (cellValue === 0) {
            // Hit a Star - game over
            setGameStatus('lost');
            setGrid(newGrid);
        } else {
            // Update score
            setScore(prev => prev * cellValue);
            setGrid(newGrid);

            // Check win condition
            if (checkWinCondition(newGrid)) {
                setGameStatus('won');
            }
        }
    };

    // Start new game
    const handleNewGame = () => {
        const newGrid = generateGrid();
        setGrid(newGrid);
        setScore(1);
        setGameStatus('playing');
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
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Starburst</Text>
                <View style={styles.headerSpacer} />
            </View>

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
                {/* Top row for column hints */}
                <View style={styles.hintRow}>
                    <View style={styles.cornerCell} />
                    {colHints.map((hint, idx) => (
                        <View key={idx} style={styles.hintCell}>
                            <Text style={styles.hintSum}>{hint.sum}</Text>
                            <Text style={styles.hintStar}>{hint.starCount}</Text>
                        </View>
                    ))}
                </View>

                {/* Grid rows with row hints */}
                {grid.map((row, rowIdx) => (
                    <View key={rowIdx} style={styles.gridRow}>
                        {/* Row hint */}
                        <View style={styles.hintCell}>
                            <Text style={styles.hintSum}>{rowHints[rowIdx]?.sum || 0}</Text>
                            <Text style={styles.hintStar}>{rowHints[rowIdx]?.starCount || 0}</Text>
                        </View>

                        {/* Grid cells */}
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

            <View style={styles.instructions}>
                <Text style={styles.instructionText}>
                    Flip all 2s and 3s to win!
                </Text>
                <Text style={styles.instructionText}>
                    Avoid Stars (⭐) - they end the game!
                </Text>
            </View>

            <View style={styles.newGameContainer}>
                <TouchableOpacity style={styles.newGameButton} onPress={handleNewGame}>
                    <Text style={styles.newGameButtonText}>New Game</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const { width } = Dimensions.get('window');
const CELL_SIZE = Math.min((width - 100) / (GRID_SIZE + 1), 50);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#E8F5E8',
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        marginTop: 10,
    },
    headerSpacer: {
        width: 80, // Same width as back button to center title
    },
    backButton: {
        backgroundColor: '#2E5A3E',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    backButtonText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    title: {
        fontSize: 20,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    newGameContainer: {
        alignItems: 'center',
        marginTop: 15,
        marginBottom: 10,
    },
    newGameButton: {
        backgroundColor: '#2E5A3E',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    newGameButtonText: {
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
        fontSize: 10,
    },
    scoreContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    scoreLabel: {
        fontSize: 14,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        marginRight: 10,
    },
    scoreValue: {
        fontSize: 18,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    messageContainer: {
        backgroundColor: '#2E5A3E',
        padding: 15,
        borderRadius: 10,
        marginBottom: 15,
        alignItems: 'center',
    },
    winMessage: {
        fontSize: 16,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
    },
    loseMessage: {
        fontSize: 16,
        color: '#E8F5E8',
        fontFamily: 'PressStart2P',
    },
    gameBoard: {
        alignItems: 'center',
        marginBottom: 20,
    },
    hintRow: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    gridRow: {
        flexDirection: 'row',
        marginBottom: 5,
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
        borderRadius: 5,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 2,
    },
    hintSum: {
        fontSize: 12,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    hintStar: {
        fontSize: 10,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    cell: {
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderWidth: 2,
        borderColor: '#2E5A3E',
        borderRadius: 5,
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
        fontSize: 16,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
    },
    instructions: {
        marginTop: 20,
        padding: 15,
        backgroundColor: '#D4E8D4',
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#2E5A3E',
    },
    instructionText: {
        fontSize: 10,
        color: '#2E5A3E',
        fontFamily: 'PressStart2P',
        marginBottom: 5,
        textAlign: 'center',
    },
});

export default Starburst;

