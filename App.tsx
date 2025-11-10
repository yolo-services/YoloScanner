import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Screen = 'settings' | 'scan';
const { width, height } = Dimensions.get('window');

export default function App() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>('scan');
  const [cameraType, setCameraType] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<boolean>(false);
  const cameraRef = useRef<CameraView>(null);

  const [connected, setConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermission(status === 'granted');

      const url = await AsyncStorage.getItem('serverUrl');
      if (url) connectToServer(url, false);
    })();
  }, []);

  const connectToServer = (url: string, manual = true) => {
    try {
      const socket = new WebSocket(url);
      socket.onopen = async () => {
        setConnected(true);
        setWs(socket);
        await AsyncStorage.setItem('serverUrl', url);
        if (manual) setScreen('settings');
      };
      socket.onclose = async () => {
        setConnected(false);
        setWs(null);
        setScreen('scan');
        await AsyncStorage.removeItem('serverUrl');
      };
      socket.onerror = (e) => console.error('WebSocket error', e);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (data.startsWith('ws://')) {
      connectToServer(data, false);
    } else if (ws && connected) {
      ws.send(JSON.stringify({ type: 'text', text: data }));
      setScreen('settings');
    }
  };

  const sendText = () => {
    if (ws && text.trim()) {
      ws.send(JSON.stringify({ type: 'text', text }));
      setText('');
    }
  };

  if (permission === null) return <Text>Checking permissions...</Text>;
  if (!permission)
    return (
      <View style={styles.center}>
        <Text>No access to camera</Text>
        <Button
          title="Try Again"
          onPress={async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setPermission(status === 'granted');
          }}
        />
      </View>
    );

  // Scanner view
  if (screen === 'scan') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={cameraType}
          enableTorch={flash}
          onBarcodeScanned={handleBarCodeScanned}
        />
        <View style={styles.scannerFrame} />

        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.flashButton}
            onPress={() => setFlash(prev => !prev)}
          >
            <Text style={styles.flashText}>{flash ? '🔦 ON ' : '🔦 OFF'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setCameraType(prev => (prev === 'back' ? 'front' : 'back'))}
          >
            <Text style={styles.switchText}>🔄</Text>
          </TouchableOpacity>

          {connected && (
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setScreen('settings')}
            >
              <Text style={styles.switchText}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Settings view
  if (screen === 'settings') {
    return (
      <View style={styles.connected}>
        {/* Back arrow */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setScreen('scan')}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>✅ Connected to PC</Text>
        <TextInput
          placeholder="Type a message"
          style={styles.input}
          value={text}
          onChangeText={setText}
        />
        <Button title="Send" onPress={sendText} />
        <Button
          title="Disconnect"
          color="red"
          onPress={() => {
            ws?.close();
            setConnected(false);
            setScreen('scan');
          }}
        />
      </View>
    );
  }
}

const FRAME_SIZE = width * 0.7;

const styles = StyleSheet.create({
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  scannerFrame: {
    position: 'absolute',
    top: (height - FRAME_SIZE) / 2,
    left: (width - FRAME_SIZE) / 2,
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderColor: 'white',
    borderWidth: 3,
    borderRadius: 12,
  },
  overlay: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  flashButton: { 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    padding: 14, 
    borderRadius: 12, 
    width: 90,
    alignItems: 'center',
  },
  flashText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  switchButton: { 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    padding: 14, 
    borderRadius: 12,
    width: 90, 
    alignItems: 'center',
  },
  switchText: { color: 'white', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  connected: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, marginBottom: 12, width: '80%' },
  backButton: { position: 'absolute', top: 40, left: 20 },
  backText: { fontSize: 36, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
