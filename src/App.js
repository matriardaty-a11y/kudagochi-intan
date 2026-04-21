import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Apple, Heart, Zap, Moon, RefreshCcw, Play, Sparkles, Cloud, Loader2, MessageCircle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// Setup Firebase (Bisa dibiarkan kosong dulu, game akan tetap jalan secara lokal/offline)
const firebaseConfig = {
  apiKey: "AIzaSyCJrs0WG7kf793Ei9pHSQIbxealPz0gxWo",
  authDomain: "kudagochi-intan-birthday-game.firebaseapp.com",
  projectId: "kudagochi-intan-birthday-game",
  storageBucket: "kudagochi-intan-birthday-game.firebasestorage.app",
  messagingSenderId: "250944679051",
  appId: "1:250944679051:web:995b08f4bf35a5b28bf88e",
  measurementId: "G-1Z6TDF0ZEG"
};

const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = 'kudagochi-app-1';

const App = () => {
  // State untuk status kuda
  const [hunger, setHunger] = useState(100);
  const [happiness, setHappiness] = useState(100);
  const [energy, setEnergy] = useState(100);
  const [cleanliness, setCleanliness] = useState(100);
  const [poopCount, setPoopCount] = useState(0);
  const [isSleeping, setIsSleeping] = useState(false);
  const [isDead, setIsDead] = useState(false);
  const [age, setAge] = useState(0);
  const [message, setMessage] = useState('Halo! Aku kuda barumu. Rawat aku ya!');
  const [actionTrigger, setActionTrigger] = useState(''); 
  const [chatInput, setChatInput] = useState(''); 

  // State untuk Cloud Save & Loading
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Ref untuk menampung state terbaru
  const stateRef = useRef({ hunger, happiness, energy, cleanliness, poopCount, isSleeping, isDead, age });
  useEffect(() => {
    stateRef.current = { hunger, happiness, energy, cleanliness, poopCount, isSleeping, isDead, age };
  }, [hunger, happiness, energy, cleanliness, poopCount, isSleeping, isDead, age]);

  // Konstanta untuk Mode Pekerja (Santai)
  const TICKS_PER_HOUR = 1800; // 1 tick = 2 detik. 1 Jam = 1800 tick.
  const HUNGER_DROP = 100 / (6 * TICKS_PER_HOUR); // Habis dalam 6 Jam
  const HAPPINESS_DROP = 100 / (8 * TICKS_PER_HOUR); // Habis dalam 8 Jam
  const ENERGY_DROP = 100 / (16 * TICKS_PER_HOUR); // Habis dalam 16 Jam bangun
  const ENERGY_RECOVER = 100 / (8 * TICKS_PER_HOUR); // Penuh setelah 8 Jam tidur
  const CLEAN_DROP = 100 / (12 * TICKS_PER_HOUR); // Kotor dalam 12 Jam
  const POOP_CHANCE = 1 / (2 * TICKS_PER_HOUR); // Rata-rata pup tiap 2 jam
  const AGE_INCREASE = 1 / TICKS_PER_HOUR; // 1 Jam di dunia nyata = 1 Tahun Kuda

  // Auth Effect (Koneksi ke server)
  useEffect(() => {
    if (!auth) {
       setIsLoaded(true);
       return;
    }
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth error:", error);
        setIsLoaded(true); 
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Load Data Effect & Hitung Progress saat Offline
  useEffect(() => {
    if (!user) return;
    if (!db) { setIsLoaded(true); return; }
    
    const loadGame = async () => {
      try {
        const docRef = doc(db, 'saves', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const now = Date.now();
          const passedMs = Math.max(0, now - (data.lastSaved || now));
          const passedTicks = Math.floor(passedMs / 2000);

          let { hunger: hg, happiness: hp, energy: en, cleanliness: cl, poopCount: pc, isSleeping: slp, isDead: dd, age: ag } = data;

          if (!dd && passedTicks > 0) {
            ag += passedTicks * AGE_INCREASE;

            if (slp) {
              const recovered = passedTicks * ENERGY_RECOVER;
              if (en + recovered >= 100) {
                en = 100;
                slp = false;
              } else {
                en += recovered;
              }
            } else {
              en = Math.max(0, en - (passedTicks * ENERGY_DROP));
              hg = Math.max(0, hg - (passedTicks * HUNGER_DROP));
              cl = Math.max(0, cl - (passedTicks * CLEAN_DROP));
              hp = Math.max(0, hp - (passedTicks * HAPPINESS_DROP));
              const expectedPoops = passedTicks * POOP_CHANCE;
              pc = Math.min(3, pc + (expectedPoops > Math.random() ? Math.ceil(expectedPoops) : Math.floor(expectedPoops)));
            }

            if (hg <= 0 || hp <= 0 || en <= 0 || cl <= 0) dd = true;
          }

          setHunger(hg); setHappiness(hp); setEnergy(en); setCleanliness(cl);
          setPoopCount(pc); setIsSleeping(slp); setIsDead(dd); setAge(ag);
          
          if (dd) setMessage('Kudamu tidak terawat selama kamu pergi 😭');
          else if (passedTicks > 30) setMessage('Selamat datang kembali! Kudamu merindukanmu.');
        }
      } catch (error) {
        console.error("Gagal load data", error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadGame();
  }, [user]);

  // Autosave Effect
  const saveToCloud = useCallback(async () => {
    if (!user || !isLoaded || !db) return;
    setIsSaving(true);
    try {
        const docRef = doc(db, 'saves', user.uid);
        await setDoc(docRef, {
            ...stateRef.current,
            lastSaved: Date.now()
        });
    } catch (err) {
        console.error("Failed to save", err);
    } finally {
        setTimeout(() => setIsSaving(false), 1000);
    }
  }, [user, isLoaded]);

  useEffect(() => {
    if (!user || !isLoaded) return;
    const interval = setInterval(saveToCloud, 10000);
    return () => clearInterval(interval);
  }, [saveToCloud, user, isLoaded]);

  // Game Loop: Mengurangi status setiap 2 detik
  useEffect(() => {
    if (isDead || !isLoaded) return;

    const gameLoop = setInterval(() => {
      setAge((prev) => prev + AGE_INCREASE);

      if (isSleeping) {
        setEnergy((prev) => {
          const newEnergy = prev + ENERGY_RECOVER;
          if (newEnergy >= 100) {
            setIsSleeping(false);
            setMessage('Kudamu sudah bangun dan segar kembali!');
            return 100;
          }
          return newEnergy;
        });
      } else {
        setHunger((prev) => Math.max(0, prev - HUNGER_DROP));
        setHappiness((prev) => Math.max(0, prev - (HAPPINESS_DROP + (poopCount * 0.005)))); 
        setEnergy((prev) => Math.max(0, prev - ENERGY_DROP));
        setCleanliness((prev) => Math.max(0, prev - CLEAN_DROP));

        if (Math.random() < POOP_CHANCE) {
          setPoopCount((prev) => Math.min(3, prev + 1));
        }
      }
    }, 2000);

    return () => clearInterval(gameLoop);
  }, [isDead, isSleeping, poopCount, isLoaded]);

  // Cek kondisi mati
  useEffect(() => {
    if (hunger <= 0 || happiness <= 0 || energy <= 0 || cleanliness <= 0) {
      if (!isDead) {
        setIsDead(true);
        setMessage('Oh tidak! Kudamu tidak terawat dan pergi meninggalkamu 😭');
      }
    }
  }, [hunger, happiness, energy, cleanliness, isDead]);

  // Aksi Interaksi
  const feed = () => {
    if (isSleeping || isDead) return;
    setHunger((prev) => Math.min(100, prev + 25));
    setMessage('Nyam nyam! Apelnya manis sekali 🍎');
    setActionTrigger('feed');
    setTimeout(() => setActionTrigger(''), 500);
  };

  const play = () => {
    if (isSleeping || isDead) return;
    setHappiness((prev) => Math.min(100, prev + 20));
    setEnergy((prev) => Math.max(0, prev - 15));
    setHunger((prev) => Math.max(0, prev - 5));
    setMessage('Yihaa! Seru sekali berlarian di padang rumput 🐎');
    setActionTrigger('play');
    setTimeout(() => setActionTrigger(''), 500);
  };

  const sleep = () => {
    if (isDead || energy >= 90) {
      if(energy >= 90 && !isDead) setMessage('Aku belum ngantuk!');
      return;
    }
    setIsSleeping(true);
    setMessage('Zzz... Zzz... 😴');
  };

  const clean = () => {
    if (isSleeping || isDead) return;
    setCleanliness((prev) => Math.min(100, prev + 30));
    setPoopCount(0);
    setMessage('Wah, kandangnya jadi bersih dan wangi! ✨');
    setActionTrigger('clean');
    setTimeout(() => setActionTrigger(''), 500);
  };

  const pet = () => {
    if (isSleeping || isDead) return;
    setHappiness((prev) => Math.min(100, prev + 5));
    setMessage('Hehe, aku suka dielus! 🥰');
    setActionTrigger('pet');
    setTimeout(() => setActionTrigger(''), 500);
  };

  const chatWithHorse = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isSleeping || isDead) return;

    const horseResponses = [
      "Ngiihihihihi! 🐴 (Sepertinya dia setuju denganmu)",
      "Prrrtt... *menyemburkan udara dari hidung*",
      "*mengendus-endus tanganmu dengan penasaran*",
      "*menggosokkan kepalanya ke lenganmu dengan lembut* 💖",
      "*mengangguk-angguk seolah mengerti bebanmu*",
      "Pppffftthh... 🌾 (Dia mengunyah rumput sambil mendengarkan)",
      "*menjilat pipimu!* (Dia mencoba menghiburmu!)",
      "Hiii-aaah! 🐎 (Dia menyemangatimu!)",
      "*kudamu menatapmu dengan mata bulatnya yang damai*"
    ];

    const randomResponse = horseResponses[Math.floor(Math.random() * horseResponses.length)];
    setMessage(randomResponse);
    setChatInput(''); 
    setHappiness((prev) => Math.min(100, prev + 2));
    setActionTrigger('pet');
    setTimeout(() => setActionTrigger(''), 500);
  };

  const resetGame = async () => {
    setHunger(100); setHappiness(100); setEnergy(100); setCleanliness(100);
    setPoopCount(0); setIsSleeping(false); setIsDead(false); setAge(0);
    setMessage('Kuda baru telah datang! Jangan sampai sakit lagi ya.');

    if (user && db) {
        setIsSaving(true);
        const docRef = doc(db, 'saves', user.uid);
        await setDoc(docRef, {
            hunger: 100, happiness: 100, energy: 100, cleanliness: 100,
            poopCount: 0, isSleeping: false, isDead: false, age: 0,
            lastSaved: Date.now()
        });
        setIsSaving(false);
    }
  };

  const getHorseEmoji = () => {
    if (isDead) return '💀';
    if (isSleeping) return '😴';
    if (actionTrigger === 'play') return '🐎';
    if (actionTrigger === 'feed') return '🐴🍎';
    if (actionTrigger === 'pet') return '💖';
    if (hunger < 30 || happiness < 30 || energy < 30 || cleanliness < 30) return '🤒'; 
    if (age >= 20) return '🦄'; 
    if (age >= 10) return '🐴'; 
    return '🐎'; 
  };

  const getBarColor = (value) => {
    if (value > 60) return 'bg-green-500';
    if (value > 30) return 'bg-yellow-400';
    return 'bg-red-500';
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4 font-sans text-green-800">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="font-bold text-lg">Memuat Kandang Kudamu...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm border-4 border-orange-200">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4 text-xs font-bold">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 uppercase tracking-wider rounded-full flex items-center shadow-sm border border-blue-200">
            🏢 Mode Pekerja
          </span>
          <span className={`flex items-center gap-1 px-3 py-1 rounded-full shadow-sm border transition-colors ${isSaving ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
            {isSaving ? 'Menyimpan...' : (auth ? 'Tersimpan' : 'Lokal')}
          </span>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-orange-600 mb-1">KudaGochi</h1>
          <p className="text-gray-500 font-medium text-sm">Umur: {Math.floor(age)} Tahun Kuda</p>
        </div>

        {/* Layar Main / Display */}
        <div className={`relative h-48 rounded-2xl mb-6 border-4 flex flex-col items-center justify-center transition-colors duration-500 ${isSleeping ? 'bg-indigo-900 border-indigo-700' : isDead ? 'bg-gray-800 border-gray-600' : 'bg-blue-100 border-blue-300 overflow-hidden'}`}>
          {!isSleeping && !isDead && (
            <>
              <div className="absolute top-4 left-4 text-yellow-500 text-2xl">☀️</div>
              <div className="absolute top-6 right-8 text-white opacity-90 text-3xl">☁️</div>
              <div className="absolute bottom-0 w-full h-12 bg-green-400 rounded-b-xl border-t-4 border-green-500"></div>
            </>
          )}
          {isSleeping && !isDead && (
            <div className="absolute top-4 right-6 text-yellow-200 text-2xl">🌙</div>
          )}

          {!isDead && Array.from({ length: poopCount }).map((_, i) => (
            <div key={i} className="absolute bottom-2 text-2xl z-20" style={{ left: `${25 + i * 20}%` }}>💩</div>
          ))}
          
          <div 
            onClick={pet}
            className={`text-7xl z-10 cursor-pointer hover:scale-110 transition-transform ${actionTrigger === 'play' ? 'animate-bounce' : ''} ${actionTrigger === 'feed' ? 'animate-pulse' : ''} ${actionTrigger === 'clean' ? 'rotate-12' : ''}`}
            title="Klik aku untuk dielus!"
          >
            {getHorseEmoji()}
          </div>
          
          <div className={`mt-4 px-4 py-2 rounded-xl text-center text-sm font-semibold z-10 max-w-[90%] shadow-sm ${isSleeping || isDead ? 'text-white bg-black/50' : 'text-gray-800 bg-white/90'}`}>
            {message}
          </div>
        </div>

        {/* Status Bars */}
        <div className="space-y-4 mb-8">
          <div>
            <div className="flex justify-between text-sm font-bold text-gray-700 mb-1">
              <span className="flex items-center gap-1"><Apple size={16} className="text-red-500"/> Kenyang</span>
              <span>{Math.round(hunger)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all duration-300 ${getBarColor(hunger)}`} style={{ width: `${Math.round(hunger)}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm font-bold text-gray-700 mb-1">
              <span className="flex items-center gap-1"><Heart size={16} className="text-pink-500"/> Senang</span>
              <span>{Math.round(happiness)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all duration-300 ${getBarColor(happiness)}`} style={{ width: `${Math.round(happiness)}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm font-bold text-gray-700 mb-1">
              <span className="flex items-center gap-1"><Zap size={16} className="text-yellow-500"/> Energi</span>
              <span>{Math.round(energy)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all duration-300 ${getBarColor(energy)}`} style={{ width: `${Math.round(energy)}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm font-bold text-gray-700 mb-1">
              <span className="flex items-center gap-1"><Sparkles size={16} className="text-blue-500"/> Bersih</span>
              <span>{Math.round(cleanliness)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all duration-300 ${getBarColor(cleanliness)}`} style={{ width: `${Math.round(cleanliness)}%` }}></div>
            </div>
          </div>
        </div>

        {/* Kontrol (Tombol-tombol) */}
        {!isDead ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={feed} disabled={isSleeping} className="flex flex-col items-center justify-center p-3 bg-red-100 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-red-700 font-bold transition-transform active:scale-95 border-2 border-red-200">
                <Apple size={24} className="mb-1" /> Makan
              </button>
              <button onClick={play} disabled={isSleeping} className="flex flex-col items-center justify-center p-3 bg-pink-100 hover:bg-pink-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-pink-700 font-bold transition-transform active:scale-95 border-2 border-pink-200">
                <Play size={24} className="mb-1" /> Main
              </button>
              <button onClick={clean} disabled={isSleeping} className="flex flex-col items-center justify-center p-3 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-blue-700 font-bold transition-transform active:scale-95 border-2 border-blue-200">
                <Sparkles size={24} className="mb-1" /> Bersihkan
              </button>
              <button onClick={sleep} disabled={isSleeping} className="flex flex-col items-center justify-center p-3 bg-indigo-100 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-indigo-700 font-bold transition-transform active:scale-95 border-2 border-indigo-200">
                <Moon size={24} className="mb-1" /> Tidur
              </button>
            </div>

            {/* Area Curhat */}
            <div className="mt-4 pt-4 border-t-2 border-orange-100">
              <form onSubmit={chatWithHorse} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ada yang mau diceritakan?"
                  className="flex-1 px-3 py-2 border-2 border-orange-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm text-gray-700 placeholder-gray-400 bg-white"
                  disabled={isSleeping}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={isSleeping || !chatInput.trim()}
                  className="flex items-center justify-center px-4 bg-orange-100 hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-orange-700 font-bold transition-colors border-2 border-orange-200"
                  title="Kirim Curhatan"
                >
                  <MessageCircle size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <button onClick={resetGame} className="w-full flex items-center justify-center gap-2 p-4 bg-orange-500 hover:bg-orange-600 rounded-xl text-white font-bold text-lg transition-transform active:scale-95 shadow-lg">
            <RefreshCcw size={24} /> Pelihara Kuda Baru
          </button>
        )}
      </div>
    </div>
  );
};

export default App;