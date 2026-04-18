import { FC } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const Navigation: FC = () => {
    return (
        <View style={styles.nav}>
            <View style={styles.container}>
                <View style={styles.menu}>
                    <TouchableOpacity>
                        <Text style={styles.logo}>Hoshino</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.button}>
                        <Text style={styles.buttonText}>Moonokos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.button}>
                        <Text style={styles.buttonText}>Gallery</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    nav: {
        backgroundColor: '#27272a',
        paddingHorizontal: 24,
        paddingVertical: 16,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
    },
    container: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: 1200,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    menu: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logo: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    button: {
        marginLeft: 32,
        paddingHorizontal: 16,
    },
    buttonText: {
        fontSize: 16,
        color: '#d4d4d8',
    },
});

export default Navigation;