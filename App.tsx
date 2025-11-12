import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Animated,
  Vibration,
  useColorScheme,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Screen = 'settings' | 'scan';
const { width, height } = Dimensions.get('window');

export default function App() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [permission, setPermission] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>('scan');
  const [cameraType, setCameraType] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<boolean>(false);
  const [scanDelay, setScanDelay] = useState<number>(900); // ms

  const cameraRef = useRef<CameraView>(null);
  const [connected, setConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [text, setText] = useState('');

  const popupOpacity = useRef(new Animated.Value(0)).current;
  const scanFlashOpacity = useRef(new Animated.Value(0)).current;
  const lastScanTime = useRef<number>(0);

  const themed = styles(isDark);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermission(status === 'granted');

      const url = await AsyncStorage.getItem('serverUrl');
      if (url) connectToServer(url, false);

      const savedDelay = await AsyncStorage.getItem('scanDelay');
      if (savedDelay) setScanDelay(Number(savedDelay));
    })();
  }, []);

  const showConnectedPopup = () => {
    Animated.sequence([
      Animated.timing(popupOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(popupOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const showScanFlash = () => {
    Vibration.vibrate(100);
    Animated.sequence([
      Animated.timing(scanFlashOpacity, { toValue: 0.6, duration: 80, useNativeDriver: true }),
      Animated.timing(scanFlashOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const connectToServer = (url: string, manual = true) => {
    try {
      console.log(url);
      const socket = new WebSocket(url);
      socket.onopen = async () => {
        setConnected(true);
        setWs(socket);
        await AsyncStorage.setItem('serverUrl', url);
        if (manual) setScreen('settings');
        showConnectedPopup();
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
    console.log('handleBarCodeScanned', data);
    const now = Date.now();
    if (now - lastScanTime.current < scanDelay) return;
    lastScanTime.current = now;

    showScanFlash();
    if (data.startsWith('ws://')) {
      connectToServer(data, false);
    } else if (ws && connected) {
      ws.send(JSON.stringify({ type: 'text', text: data }));
    }
  };

  const sendText = () => {
    if (ws && text.trim()) {
      ws.send(JSON.stringify({ type: 'text', text }));
      setText('');
    }
  };

  const handleDelayChange = async (value: string) => {
    const parsed = Number(value);
    if (!isNaN(parsed)) {
      setScanDelay(parsed);
      await AsyncStorage.setItem('scanDelay', parsed.toString());
    }
  };

  if (permission === null) return <Text>Checking permissions...</Text>;
  if (!permission)
    return (
      <View style={themed.center}>
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

  // SCAN VIEW
  if (screen === 'scan') {
    return (
      <View style={themed.cameraContainer}>
          {!connected && (
            <View style={themed.infoBanner}>
              <Text style={themed.infoText}>
                Aby połączyć się z komputerem, otwórz aplikację{" "}
                <Text style={{ fontWeight: 'bold' }}>YoloConnect</Text> na PC
                {"\n"}i zeskanuj kod QR wyświetlony na ekranie.
              </Text>
            </View>
          )}
        <CameraView
          ref={cameraRef}
          style={themed.camera}
          facing={cameraType}
          enableTorch={flash}
          barcodeScannerSettings={{
            barcodeTypes: [
              'aztec', 'codabar', 'code128', 'code39', 'code93', 'datamatrix',
              'ean13', 'ean8', 'itf14', 'pdf417', 'qr', 'upc_a', 'upc_e',
            ],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        />

        <View style={themed.scannerFrame} />

        <View style={themed.overlay}>
          <TouchableOpacity
            style={themed.flashButton}
            onPress={() => setFlash(prev => !prev)}
          >
            <Text style={themed.flashText}>{flash ? '🔦 ON' : '🔦 OFF'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={themed.switchButton}
            onPress={() => setCameraType(prev => (prev === 'back' ? 'front' : 'back'))}
          >
            <Text style={themed.switchText}>🔄</Text>
          </TouchableOpacity>

          {connected && (
            <TouchableOpacity
              style={themed.switchButton}
              onPress={() => setScreen('settings')}
            >
              <Text style={themed.switchText}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>

        <Animated.View pointerEvents="none" style={[themed.scanFlash, { opacity: scanFlashOpacity }]} />
        <Animated.View pointerEvents="none" style={[themed.popup, { opacity: popupOpacity }]}>
          <Text style={themed.popupText}>✅ Connected!</Text>
        </Animated.View>
      </View>
    );
  }

  // SETTINGS VIEW
  if (screen === 'settings') {
    return (
      <View style={themed.connected}>
        <TouchableOpacity style={themed.backButton} onPress={() => setScreen('scan')}>
          <Text style={themed.backText}>←</Text>
        </TouchableOpacity>

        <Text style={themed.connectedText}>✅ Connected to PC</Text>

        <TextInput
          placeholder="Type a message"
          placeholderTextColor={isDark ? '#aaa' : '#666'}
          style={themed.input}
          value={text}
          onChangeText={setText}
        />
        <Button title="Send" onPress={sendText} />

        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Scan Delay (ms)</Text>
          <TextInput
            keyboardType="numeric"
            placeholderTextColor={isDark ? '#aaa' : '#666'}
            style={[themed.input, { width: 120, textAlign: 'center' }]}
            value={String(scanDelay)}
            onChangeText={handleDelayChange}
          />
        </View>

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

const styles = (isDark: boolean) => StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: isDark ? '#000' : '#fff',
  },
  camera: { flex: 1 },
  scannerFrame: {
    position: 'absolute',
    top: (height - FRAME_SIZE) / 2,
    left: (width - FRAME_SIZE) / 2,
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderColor: isDark ? '#0f0' : 'white',
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.6)',
    padding: 14,
    borderRadius: 12,
    width: 90,
    alignItems: 'center',
  },
  flashText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  switchButton: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.6)',
    padding: 14,
    borderRadius: 12,
    width: 90,
    alignItems: 'center',
  },
  connectedText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: isDark ? '#fff' : '#000',
  },
  switchText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  connected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 12,
    backgroundColor: isDark ? '#000' : '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: isDark ? '#555' : '#ccc',
    backgroundColor: isDark ? '#111' : '#fff',
    color: isDark ? '#fff' : '#000',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    width: '80%',
  },
  backButton: { position: 'absolute', top: 40, left: 20 },
  backText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: isDark ? '#fff' : '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? '#000' : '#fff',
  },
  popup: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: isDark
      ? 'rgba(0,150,0,0.8)'
      : 'rgba(0,200,0,0.9)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    zIndex: 999,
  },
  popupText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  scanFlash: {
    position: 'absolute',
    backgroundColor: isDark
      ? 'rgba(0,255,0,0.2)'
      : 'rgba(0,255,0,0.4)',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  infoBanner: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    borderRadius: 10,
  },
  infoText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
  },
});