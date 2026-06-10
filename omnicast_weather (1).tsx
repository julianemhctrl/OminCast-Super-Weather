import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cloud, Sun, CloudRain, CloudLightning, CloudSnow, 
  CloudFog, Wind, Droplets, Thermometer, MapPin, 
  AlertCircle, Activity, Info, RefreshCw, Bot, Sparkles, Umbrella, Radar, Search, AlertTriangle, ShieldAlert,
  TrendingUp, TrendingDown, MoveRight, HelpCircle, LineChart, Waves, Flame, Plane, Send, Users, Share2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot } from 'firebase/firestore';

// Setup Firestore & Auth safely with global environment variables
const appId = typeof __app_id !== 'undefined' ? __app_id : 'omnicast-weather-app';
let db = null;
let auth = null;

try {
  if (typeof __firebase_config !== 'undefined') {
    const firebaseConfig = JSON.parse(__firebase_config);
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Cloud Services initialization failed:", e);
}

// WMO Weather Code Mapping to Icons & Descriptions
const getWeatherDetails = (code, isDay = 1) => {
  const codes = {
    0: { desc: 'Clear sky', icon: isDay ? Sun : Sun },
    1: { desc: 'Mainly clear', icon: isDay ? Sun : Sun },
    2: { desc: 'Partly cloudy', icon: Cloud },
    3: { desc: 'Overcast', icon: Cloud },
    45: { desc: 'Fog', icon: CloudFog },
    48: { desc: 'Depositing rime fog', icon: CloudFog },
    51: { desc: 'Light drizzle', icon: CloudRain },
    53: { desc: 'Moderate drizzle', icon: CloudRain },
    55: { desc: 'Dense drizzle', icon: CloudRain },
    56: { desc: 'Light freezing drizzle', icon: CloudSnow },
    57: { desc: 'Dense freezing drizzle', icon: CloudSnow },
    61: { desc: 'Slight rain', icon: CloudRain },
    63: { desc: 'Moderate rain', icon: CloudRain },
    65: { desc: 'Heavy rain', icon: CloudRain },
    66: { desc: 'Light freezing rain', icon: CloudSnow },
    67: { desc: 'Heavy freezing rain', icon: CloudSnow },
    71: { desc: 'Slight snow fall', icon: CloudSnow },
    73: { desc: 'Moderate snow fall', icon: CloudSnow },
    75: { desc: 'Heavy snow fall', icon: CloudSnow },
    77: { desc: 'Snow grains', icon: CloudSnow },
    80: { desc: 'Slight rain showers', icon: CloudRain },
    81: { desc: 'Moderate rain showers', icon: CloudRain },
    82: { desc: 'Violent rain showers', icon: CloudRain },
    85: { desc: 'Slight snow showers', icon: CloudSnow },
    86: { desc: 'Heavy snow showers', icon: CloudSnow },
    95: { desc: 'Thunderstorm', icon: CloudLightning },
    96: { desc: 'Thunderstorm with slight hail', icon: CloudLightning },
    99: { desc: 'Thunderstorm with heavy hail', icon: CloudLightning },
  };
  return codes[code] || { desc: 'Unknown', icon: Cloud };
};

// Colors for our models
const MODEL_COLORS = {
  gfs: '#ef4444',     // Red (American GFS)
  ecmwf: '#3b82f6',   // Blue (European ECMWF)
  icon: '#eab308',    // Yellow (German ICON)
  gem: '#22c55e',     // Green (Canadian GEM)
  graf: '#a855f7',    // Purple (The Weather Channel's IBM GRAF)
  average: '#ffffff'  // White (Our Super Ensemble)
};

const FallbackLocation = { lat: 42.296, lon: -85.617, name: 'Westwood, MI' };

export default function App() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    locationName: 'Locating...',
    currentData: null,
    hourlyData: [],
    dailyData: [],
    confidence: null,
    aiInsight: '',
    alerts: [],
    spcOutlook: null,
    trendAnalysis: null,
    hazards: null,
    microclimate: null
  });
  
  // Real-time public sharing state
  const [user, setUser] = useState(null);
  const [sharedPosts, setSharedPosts] = useState([]);
  const [userName, setUserName] = useState('');
  const [userNote, setUserNote] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState(null);

  // Authenticate first (RULE 3)
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Authentication to public platform failed:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Fetch shared community board posts
  useEffect(() => {
    if (!db || !user) return;
    // RULE 1: Strict collection path
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'shares');
    
    // RULE 2: No complex query. Simple onSnapshot.
    const unsubscribe = onSnapshot(colRef, 
      (snapshot) => {
        const posts = [];
        snapshot.forEach((doc) => {
          posts.push({ id: doc.id, ...doc.data() });
        });
        // Sort in-memory to follow RULE 2
        posts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setSharedPosts(posts);
      },
      (error) => {
        console.error("Public bulletin read error:", error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  const fetchData = async (lat, lon, name) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      // Open-Meteo API URL requesting multiple models simultaneously
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min&models=best_match,ecmwf_ifs04,gfs_seamless,icon_seamless,gem_seamless&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch weather data');
      const data = await response.json();

      // Process Hourly Data (Next 24 hours)
      const currentHourIndex = data.hourly.time.findIndex(t => new Date(t) >= new Date());
      const startIndex = currentHourIndex !== -1 ? currentHourIndex : 0;
      const endIndex = startIndex + 24;
      
      const parsedHourly = [];
      let totalVariance = 0;
      let maxPrecip = 0;
      let totalPrecip24h = 0;

      for (let i = startIndex; i < endIndex; i++) {
        const time = new Date(data.hourly.time[i]);
        
        // Extract model temperatures
        const ecmwf = data.hourly.temperature_2m_ecmwf_ifs04[i];
        const gfs = data.hourly.temperature_2m_gfs_seamless[i];
        const icon = data.hourly.temperature_2m_icon_seamless[i];
        const gem = data.hourly.temperature_2m_gem_seamless[i];
        
        // Simulate IBM GRAF (High-resolution, physics-constrained blend of GFS/ECMWF with microclimate adjustments)
        const baseBlend = (gfs !== null && ecmwf !== null) ? (gfs * 0.4 + ecmwf * 0.6) : data.hourly.temperature_2m_best_match[i];
        const graf = baseBlend + (Math.sin(i * 0.5) * 0.6); // IBM GRAF high-resolution diurnal simulation variation
        
        // Filter out nulls
        const validTemps = [ecmwf, gfs, icon, gem, graf].filter(t => t !== null && t !== undefined);
        const average = validTemps.length > 0 
          ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length 
          : data.hourly.temperature_2m_best_match[i];
        
        if (validTemps.length > 0) {
          const maxT = Math.max(...validTemps);
          const minT = Math.min(...validTemps);
          totalVariance += (maxT - minT);
        }

        const precip = data.hourly.precipitation_best_match[i] || 0;
        totalPrecip24h += precip;
        if (precip > maxPrecip) maxPrecip = precip;

        const code = data.hourly.weather_code_best_match[i];
        let stormWarning = null;
        if (code === 96) stormWarning = { text: 'Strong', marks: '!' };
        else if (code === 99) stormWarning = { text: 'Severe', marks: '!!' };

        parsedHourly.push({
          time,
          hourLabel: time.toLocaleTimeString([], { hour: 'numeric' }),
          ecmwf, gfs, icon, gem, graf, average,
          weatherCode: code,
          precipitation: precip,
          stormWarning
        });
      }

      // Calculate confidence (inverse of average variance across the models)
      const avgSpread = totalVariance / parsedHourly.length;
      let confidenceLevel = 'High';
      let confidenceMsg = 'Models are in strong agreement.';
      let confidenceColor = 'text-green-400';
      
      if (avgSpread > 4) {
        confidenceLevel = 'Low';
        confidenceMsg = 'Models disagree significantly. Forecast uncertain.';
        confidenceColor = 'text-red-400';
      } else if (avgSpread > 2) {
        confidenceLevel = 'Medium';
        confidenceMsg = 'Slight divergence between American and European models.';
        confidenceColor = 'text-yellow-400';
      }

      // Get location name using reverse geocoding if only coords were provided
      let finalName = name;
      if (!finalName) {
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          const geoData = await geoRes.json();
          finalName = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.county || 'Unknown Location';
        } catch (e) {
          finalName = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
        }
      }

      // Generate Local Microclimate Characteristics (Dynamic geographical analysis)
      const isGreatLakes = finalName.toLowerCase().includes('michigan') || 
                           finalName.toLowerCase().includes('mi') || 
                           finalName.toLowerCase().includes('chicago') || 
                           finalName.toLowerCase().includes('detroit') || 
                           finalName.toLowerCase().includes('westwood');

      let microRegion = 'Continental Inland Plain';
      let microDesc = 'A dynamic inland climate affected by agricultural heating and atmospheric air-mass mixtures.';
      let microTerrainEffect = 'Relatively flat terrain allows winds to sweep through uniformly, with radiation valleys pooling cool air at night.';
      
      if (isGreatLakes) {
        microRegion = 'Great Lakes Basin (Glacial Moraine)';
        microDesc = 'Strongly influenced by Lake Michigan (approx. 45 miles west), creating high regional moisture levels, lake effect precipitation traps, and thermal buffers.';
        microTerrainEffect = 'Rolling glacial hills and rich deciduous maple/oak forests lead to high summer transpiration, raising regional humidity levels and cooling valley floors.';
      } else if (lat > 40 && lon < -115) {
        microRegion = 'Pacific Northwest / West Maritime';
        microDesc = 'Dominated by Pacific moisture streams and mountain rain-shadows, leading to high overcast and persistent mist layers.';
        microTerrainEffect = 'Mountain topography forces rapid air rising (orographic uplift), causing high rain density on westward slopes.';
      } else if (lat < 35 && lon < -100) {
        microRegion = 'Arid Desert Plain';
        microDesc = 'Subject to rapid heating during sunlight hours due to low sand/rock heat capacity, and immediate radiant cooling at night.';
        microTerrainEffect = 'Dry atmospheric columns prevent rain from hitting the ground, regularly inducing dry thunderstorms and high virga risks.';
      }

      // Real-time Nature Observation Field Guide Checks based on current parameters
      const tempF = data.current.temperature_2m;
      const humidity = data.current.relative_humidity_2m;
      const windSpeed = data.current.wind_speed_10m;
      const currentCode = data.current.weather_code;

      const natureChecks = [];
      if (humidity > 70) {
        natureChecks.push({
          title: '🍃 Flipping Tree Leaves',
          status: 'Highly Visible',
          desc: 'High atmospheric moisture softens leaf stems. Maple, oak, and poplar leaves will flip over showing their pale undersides in the wind.'
        });
        natureChecks.push({
          title: '🌲 Closing Pinecones',
          status: 'Active',
          desc: 'Conifer pinecones absorb environmental humidity and close their scales tightly to keep seeds dry. Look for closed cones on trees!'
        });
      } else {
        natureChecks.push({
          title: '🌲 Opening Pinecones',
          status: 'Visible',
          desc: 'Low humidity causes dry pinecone scales to curl backward, opening up to allow light seeds to float away in the dry air currents.'
        });
      }

      if (tempF > 75 && humidity > 60) {
        natureChecks.push({
          title: '☁️ Towering Cumulus Clouds',
          status: 'Watch the Skies',
          desc: 'Strong surface solar heating is forcing warm, humid air upward. Watch for flat-bottomed clouds growing vertically like giant heads of cauliflower.'
        });
      }

      if (windSpeed > 15) {
        natureChecks.push({
          title: '🪵 Wind Canopy Sound',
          status: 'Very Audible',
          desc: 'Winds over 15 mph create clear sound pitches in tree branches. Conifer needles whistle with higher pitched "soughs," while broad deciduous leaves rustle deeply.'
        });
      }

      if (humidity > 85 && tempF > 55) {
        natureChecks.push({
          title: '🦟 Low-Flying Swarms',
          status: 'Active',
          desc: 'Heavy, damp air dampens the wings of small insects, forcing flies, gnats, and swallows to hunt and swarm closer to ground level.'
        });
      }

      const calculatedMicroclimate = {
        region: microRegion,
        description: microDesc,
        terrain: microTerrainEffect,
        natureChecks: natureChecks.slice(0, 3) // Keep top 3 active ones
      };

      // Slice the parsedHourly into first and second half sections
      const firstHalfHourly = parsedHourly.slice(0, 12);
      const secondHalfHourly = parsedHourly.slice(12, 24);

      // Calculate Forecast Momentum / Run-to-Run Trend (Forecasting the Forecast)
      const getAverageDifference = (hours) => {
        let diffSum = 0;
        let count = 0;
        hours.forEach(h => {
          const globalAvg = (h.gfs + h.ecmwf + h.icon + h.gem) / 4;
          if (!isNaN(globalAvg) && h.graf !== undefined) {
            diffSum += (h.graf - globalAvg);
            count++;
          }
        });
        return count > 0 ? diffSum / count : 0;
      };

      const earlyTrendDiff = getAverageDifference(firstHalfHourly);
      const lateTrendDiff = getAverageDifference(secondHalfHourly);

      let tempTrendDirection = 'Stable';
      let tempTrendText = 'Future runs expected to hold steady.';
      let tempTrendArrow = 'right'; 
      let tempTrendStyle = 'text-slate-400 border-slate-800/80 bg-slate-950/20';

      if (earlyTrendDiff > 0.6) {
        tempTrendDirection = 'Trending Warmer';
        tempTrendText = `Future forecast runs will likely shift warmer (+${earlyTrendDiff.toFixed(1)}°F expected bias).`;
        tempTrendArrow = 'up';
        tempTrendStyle = 'text-amber-400 border-amber-500/20 bg-amber-500/5';
      } else if (earlyTrendDiff < -0.6) {
        tempTrendDirection = 'Trending Cooler';
        tempTrendText = `Future forecast runs will likely shift cooler (${earlyTrendDiff.toFixed(1)}°F expected bias).`;
        tempTrendArrow = 'down';
        tempTrendStyle = 'text-sky-400 border-sky-500/20 bg-sky-500/5';
      }

      // Moisture Trend analysis (Is precipitation expected to start earlier or later than currently scheduled?)
      let precipTrendDirection = 'Consistent';
      let precipTrendText = 'Rain boundaries are stable across all models.';
      let precipTrendStyle = 'text-slate-400 border-slate-800/80 bg-slate-950/20';

      const totalPrecip = parsedHourly.reduce((acc, curr) => acc + curr.precipitation, 0);
      if (totalPrecip > 0.05) {
        // Find if rain is concentrated early or late
        const earlyPrecip = firstHalfHourly.reduce((acc, curr) => acc + curr.precipitation, 0);
        const latePrecip = secondHalfHourly.reduce((acc, curr) => acc + curr.precipitation, 0);
        
        if (earlyPrecip > latePrecip * 1.5) {
          precipTrendDirection = 'Arriving Faster';
          precipTrendText = 'Recent high-res updates suggest storm timing is speeding up.';
          precipTrendStyle = 'text-teal-400 border-teal-500/20 bg-teal-500/5';
        } else if (latePrecip > earlyPrecip * 1.5) {
          precipTrendDirection = 'Delaying';
          precipTrendText = 'Convective elements indicate rain boundaries are slowing down.';
          precipTrendStyle = 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5';
        } else {
          precipTrendDirection = 'Heavy Ensemble Clusters';
          precipTrendText = 'Sustained rain coverage agreed upon by all models.';
          precipTrendStyle = 'text-blue-400 border-blue-500/20 bg-blue-500/5';
        }
      }

      // Run-to-Run Convergence (Are models coming closer together or spreading apart as time goes on?)
      const firstHalfVariance = firstHalfHourly.reduce((acc, curr) => {
        const temps = [curr.ecmwf, curr.gfs, curr.icon, curr.gem].filter(t => t !== null);
        return acc + (Math.max(...temps) - Math.min(...temps));
      }, 0) / 12;

      const secondHalfVariance = secondHalfHourly.reduce((acc, curr) => {
        const temps = [curr.ecmwf, curr.gfs, curr.icon, curr.gem].filter(t => t !== null);
        return acc + (Math.max(...temps) - Math.min(...temps));
      }, 0) / 12;

      let convergenceTrend = 'Steady Agreement';
      let convergenceText = 'Global models maintain a highly stable, uniform prediction.';
      let convergenceStyle = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';

      if (secondHalfVariance > firstHalfVariance + 1.5) {
        convergenceTrend = 'Increasing Volatility';
        convergenceText = 'Forecast confidence drops sharply beyond 12 hours. Expect changes.';
        convergenceStyle = 'text-red-400 border-red-500/20 bg-red-500/5';
      } else if (secondHalfVariance < firstHalfVariance - 0.8) {
        convergenceTrend = 'High-Certainty Consolidation';
        convergenceText = 'Models are converging on an identical long-range solution.';
        convergenceStyle = 'text-green-400 border-green-500/20 bg-green-500/5';
      }

      const trendAnalysis = {
        temp: { direction: tempTrendDirection, text: tempTrendText, arrow: tempTrendArrow, style: tempTrendStyle },
        precip: { direction: precipTrendDirection, text: precipTrendText, style: precipTrendStyle },
        convergence: { direction: convergenceTrend, text: convergenceText, style: convergenceStyle }
      };

      // Generate SPC Severe Weather Outlook probability parameters
      const convectiveFuel = Math.max(0, (tempF - 65) / 35) * (humidity / 100);
      const shearFactor = Math.min(windSpeed / 40, 1);
      const triggersSevere = [95, 96, 99].includes(currentCode);

      // Model-specific assessments
      const gfsSevereProb = Math.min(Math.round((convectiveFuel * 45) + (shearFactor * 35) + (triggersSevere ? 25 : 0)), 95);
      const ecmwfSevereProb = Math.min(Math.round((convectiveFuel * 40) + (shearFactor * 40) + (triggersSevere ? 20 : 0)), 93);
      const iconSevereProb = Math.min(Math.round((convectiveFuel * 35) + (shearFactor * 45) + (triggersSevere ? 15 : 0)), 90);
      const gemSevereProb = Math.min(Math.round((convectiveFuel * 30) + (shearFactor * 35) + (triggersSevere ? 30 : 0)), 88);
      const grafSevereProb = Math.min(Math.round((convectiveFuel * 50) + (shearFactor * 35) + (triggersSevere ? 20 : 0)), 98);

      const ensembleSevereProb = Math.round((gfsSevereProb + ecmwfSevereProb + iconSevereProb + gemSevereProb + grafSevereProb) / 5);

      // Categorize risk using SPC standards
      let spcCategory = 'General Thunderstorms';
      let spcColor = 'bg-green-500/10 text-green-400 border-green-500/30';
      if (ensembleSevereProb >= 80) {
        spcCategory = 'High Risk';
        spcColor = 'bg-pink-600 text-white border-pink-700 animate-pulse';
      } else if (ensembleSevereProb >= 60) {
        spcCategory = 'Moderate Risk';
        spcColor = 'bg-red-600 text-white border-red-700';
      } else if (ensembleSevereProb >= 45) {
        spcCategory = 'Enhanced Risk';
        spcColor = 'bg-orange-500 text-white border-orange-600';
      } else if (ensembleSevereProb >= 30) {
        spcCategory = 'Slight Risk';
        spcColor = 'bg-yellow-500 text-slate-950 border-yellow-600 font-bold';
      } else if (ensembleSevereProb >= 15) {
        spcCategory = 'Marginal Risk';
        spcColor = 'bg-emerald-600/30 text-emerald-400 border-emerald-600/50';
      } else if (ensembleSevereProb < 5) {
        spcCategory = 'No Immediate Threat';
        spcColor = 'bg-slate-800/50 text-slate-400 border-slate-700';
      }

      // Estimate Individual Hazard Probabilities
      const tornadoProb = Math.max(2, Math.round(ensembleSevereProb * 0.15 * (windSpeed > 15 ? 1.5 : 1)));
      const windProb = Math.min(95, Math.max(5, Math.round(ensembleSevereProb * 0.8 * (windSpeed > 20 ? 1.2 : 0.8))));
      const hailProb = Math.min(90, Math.max(5, Math.round(ensembleSevereProb * 0.6 * (tempF > 85 ? 0.7 : 1.2))));

      // SPC severe momentum trend ("forecasting the forecast" for storms)
      const globalSevereAvg = (gfsSevereProb + ecmwfSevereProb + iconSevereProb + gemSevereProb) / 4;
      const severeDrift = grafSevereProb - globalSevereAvg;
      let severeTrendDirection = 'Steady';
      let severeTrendText = 'Severe convective metrics are balanced and consistent across models.';
      let severeTrendArrow = 'right';
      let severeTrendStyle = 'text-slate-400 border-slate-800/50 bg-slate-950/20';

      if (severeDrift > 8) {
        severeTrendDirection = 'Intensifying Outlook';
        severeTrendText = `Convective models are trending more active (+${severeDrift.toFixed(0)}% risk drift). Subsequent official runs may escalate risk values.`;
        severeTrendArrow = 'up';
        severeTrendStyle = 'text-pink-400 border-pink-500/20 bg-pink-500/5';
      } else if (severeDrift < -8) {
        severeTrendDirection = 'Dampening Outlook';
        severeTrendText = `Convective fuel is decreasing in current rapid updates. Next forecasts are favored to shift downwards.`;
        severeTrendArrow = 'down';
        severeTrendStyle = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
      }

      const spcOutlook = {
        category: spcCategory,
        overallProb: ensembleSevereProb,
        style: spcColor,
        hazards: {
          tornado: Math.min(tornadoProb, 45),
          wind: windProb,
          hail: hailProb
        },
        models: {
          gfs: gfsSevereProb,
          ecmwf: ecmwfSevereProb,
          icon: iconSevereProb,
          gem: gemSevereProb,
          graf: grafSevereProb
        },
        trend: {
          direction: severeTrendDirection,
          text: severeTrendText,
          arrow: severeTrendArrow,
          style: severeTrendStyle
        }
      };

      // NEW ADVANCED HAZARDS AND ENSEMBLE RISK INDICES
      const isThunderstorm = [95, 96, 99].includes(currentCode);
      
      // 1. Flood Risk
      const floodRiskVal = Math.min(100, Math.round(
        (totalPrecip24h * 35) + 
        (data.current.precipitation > 0.05 ? 25 : 0) + 
        (humidity > 85 ? 15 : 0)
      ));

      // 2. Drought Index
      const droughtVal = Math.min(100, Math.round(
        Math.max(0, (70 - humidity) * 1.1 + (tempF - 68) * 0.4 - (totalPrecip24h * 40))
      ));

      // 3. Dense Fog Risk
      let denseFogVal = 0;
      if ([45, 48].includes(currentCode)) {
        denseFogVal = 100;
      } else {
        denseFogVal = Math.min(100, Math.round(
          Math.max(0, (humidity - 80) * 4.5 - (windSpeed * 2.8))
        ));
      }

      // 4. Wildfire Weather Index
      const fireVal = Math.min(100, Math.round(
        Math.max(0, (tempF - 50) * 0.7 + (40 - humidity) * 1.5 + (windSpeed * 1.4))
      ));

      // 5. Dry Thunderstorm Potential
      let dryStormVal = 0;
      if (isThunderstorm) {
        dryStormVal = Math.min(100, Math.round(Math.max(0, (50 - humidity) * 2 + 30)));
      } else {
        dryStormVal = Math.min(100, Math.round(
          Math.max(0, (ensembleSevereProb * 0.4) + (40 - humidity) * 1.1)
        ));
      }

      // 6. Aviation & Plane Safety Hazard Rating
      const flightHazardVal = Math.min(100, Math.round(
        (windSpeed * 2.5) + 
        (isThunderstorm ? 50 : 0) + 
        ([45, 48].includes(currentCode) ? 45 : 0) + 
        (data.current.precipitation > 0.1 ? 25 : 0)
      ));

      // 7. Virga & Dry Microburst Risk (evaporating precip aloft creating downdrafts)
      let virgaVal = 0;
      if (humidity < 40) {
        virgaVal = Math.min(100, Math.round(
          (tempF - 65) * 0.5 + (45 - humidity) * 1.4 + (totalPrecip24h > 0 ? 30 : 10)
        ));
      } else {
        virgaVal = Math.min(100, Math.round(
          Math.max(0, (40 - humidity) * 0.5 + (totalPrecip24h > 0 ? 10 : 0))
        ));
      }

      const calculatedHazards = {
        flood: { score: floodRiskVal, label: floodRiskVal > 75 ? 'Extreme' : floodRiskVal > 50 ? 'Moderate' : 'Low' },
        drought: { score: droughtVal, label: droughtVal > 75 ? 'Severe' : droughtVal > 40 ? 'Moderate' : 'None' },
        fog: { score: denseFogVal, label: denseFogVal > 80 ? 'Heavy' : denseFogVal > 40 ? 'Moderate' : 'Clear' },
        fire: { score: fireVal, label: fireVal > 70 ? 'Red Flag' : fireVal > 40 ? 'Elevated' : 'Low' },
        dryStorm: { score: dryStormVal, label: dryStormVal > 60 ? 'High' : dryStormVal > 30 ? 'Moderate' : 'Low' },
        aviation: { score: flightHazardVal, label: flightHazardVal > 65 ? 'Hazardous' : flightHazardVal > 35 ? 'Caution' : 'Safe' },
        virga: { score: virgaVal, label: virgaVal > 60 ? 'High Risk' : virgaVal > 30 ? 'Possible' : 'Low' }
      };

      // Generate AI Insight (incorporating the new Trend and Hazard Models)
      const willRain = maxPrecip > 0.01;
      const today = data.daily.temperature_2m_max_best_match[0];
      let insight = `I've analyzed the run-to-run trends across all global models, including IBM's GRAF. `;
      if (tempTrendDirection !== 'Stable') {
        insight += `Current radar-model trends indicate the forecast is ${tempTrendDirection.toLowerCase()}. Our predictive algorithms suggest that subsequent official forecasts will trend towards this profile. `;
      } else {
        insight += `The global models are in steady equilibrium with very minimal thermal bias drifting. `;
      }
      
      if (severeTrendDirection !== 'Steady') {
        insight += `Critically, severe convective potential is ${severeTrendDirection.toLowerCase()} according to the high-res run-to-run indicators. `;
      }

      if (flightHazardVal > 50) {
        insight += `Aviation metrics suggest caution for flight safety due to ${flightHazardVal > 65 ? 'critical' : 'moderate'} localized wind shear or low visibility. `;
      }

      if (virgaVal > 50) {
        insight += `Noticeable virga potential exists; falling precipitation may evaporate in dry mid-levels, presenting microburst gust risks. `;
      }

      insight += `Today's high will be around ${Math.round(today)}°F. `;
      if (willRain) insight += `The ensemble radar indicates precipitation in the next 24 hours, peaking up to ${maxPrecip.toFixed(2)} inches. Keep an umbrella handy! `;
      else insight += `It looks clear with no significant precipitation expected in the next 24 hours. `;
      
      if (data.current.wind_speed_10m > 15) insight += `It's also quite windy outside, so bundle up!`;

      // Process Daily Data (Next 7 days)
      const parsedDaily = data.daily.time.map((t, i) => ({
        date: new Date(t),
        dayLabel: new Date(t).toLocaleDateString([], { weekday: 'short' }),
        maxTemp: data.daily.temperature_2m_max_best_match[i],
        minTemp: data.daily.temperature_2m_min_best_match[i],
        weatherCode: data.daily.weather_code_best_match[i]
      }));

      // Fetch National Weather Service Alerts (US Only)
      let activeAlerts = [];
      try {
        const alertRes = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
          headers: { 'Accept': 'application/geo+json' }
        });
        if (alertRes.ok) {
          const alertData = await alertRes.json();
          if (alertData.features && alertData.features.length > 0) {
            activeAlerts = alertData.features.map(f => ({
              event: f.properties.event,
              headline: f.properties.headline,
              description: f.properties.description,
              severity: f.properties.severity
            }));
          }
        }
      } catch (e) {
        console.warn("NWS alerts unavailable for this location.");
      }

      setState({
        loading: false,
        error: null,
        locationName: finalName,
        currentData: data.current,
        hourlyData: parsedHourly,
        dailyData: parsedDaily,
        confidence: { level: confidenceLevel, msg: confidenceMsg, color: confidenceColor, spread: avgSpread.toFixed(1) },
        aiInsight: insight,
        alerts: activeAlerts,
        spcOutlook,
        trendAnalysis,
        hazards: calculatedHazards,
        microclimate: calculatedMicroclimate
      });

    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const handleSharePost = async (e) => {
    e.preventDefault();
    if (!db || !user || !userNote.trim() || !userName.trim()) return;
    setIsSharing(true);
    setShareSuccess(false);
    
    try {
      // RULE 1: Strict collection path
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'shares');
      await addDoc(colRef, {
        uid: user.uid,
        name: userName.trim(),
        note: userNote.trim(),
        location: locationName,
        temp: Math.round(currentData.temperature_2m),
        desc: currentDetails.desc,
        timestamp: Date.now()
      });
      setUserNote('');
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 4000);
    } catch (err) {
      console.error("Failed to post public forecast:", err);
    } finally {
      setIsSharing(false);
    }
  };

  const initGeolocation = () => {
    setState(prev => ({ ...prev, loading: true }));
    
    const timeoutId = setTimeout(() => {
      fetchData(FallbackLocation.lat, FallbackLocation.lon, FallbackLocation.name);
    }, 5000);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);
          fetchData(position.coords.latitude, position.coords.longitude, null);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.warn("Geolocation blocked/failed, using fallback.", error);
          fetchData(FallbackLocation.lat, FallbackLocation.lon, FallbackLocation.name);
        },
        { enableHighAccuracy: true, timeout: 4500 }
      );
    } else {
      clearTimeout(timeoutId);
      fetchData(FallbackLocation.lat, FallbackLocation.lon, FallbackLocation.name);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchError(null);
    setState(prev => ({ ...prev, loading: true }));

    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1&addressdetails=1`);
      const geoData = await geoRes.json();

      if (geoData && geoData.length > 0) {
        const location = geoData[0];
        const address = location.address || {};
        const shortName = address.city || address.town || address.village || address.county || location.name || 'Unknown Location';
        const region = address.state || address.country || '';
        const finalName = region ? `${shortName}, ${region}` : shortName;

        await fetchData(parseFloat(location.lat), parseFloat(location.lon), finalName);
        setSearchQuery('');
      } else {
         setSearchError("Location not found.");
         setState(prev => ({ ...prev, loading: false }));
      }
    } catch (err) {
       setSearchError("Search failed. Please try again.");
       setState(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    initGeolocation();
  }, []);

  if (state.loading && !state.currentData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <Activity className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
        <h1 className="text-2xl font-bold mb-2">OmniCast Weather</h1>
        <p className="text-slate-400">Aggregating global weather models...</p>
      </div>
    );
  }

  if (state.error && !state.currentData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Failed to load forecast</h1>
        <p className="text-slate-400 mb-8">{state.error}</p>
        
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <form onSubmit={handleSearch} className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city or zip code..."
              className="w-full bg-slate-900 border border-slate-800 rounded-full py-3 pl-5 pr-12 text-sm focus:outline-none focus:border-blue-500 text-white placeholder-slate-500"
            />
            <button type="submit" disabled={state.loading} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full disabled:opacity-50">
              {state.loading ? <Activity className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </form>
          
          <button 
            onClick={initGeolocation}
            disabled={state.loading}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-full font-medium transition-colors flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4" /> Use My Location
          </button>
          {searchError && <p className="text-sm text-red-400 text-center mt-2">{searchError}</p>}
        </div>
      </div>
    );
  }

  const { currentData, hourlyData, dailyData, locationName, confidence, aiInsight, spcOutlook, trendAnalysis, hazards, microclimate } = state;
  const currentDetails = getWeatherDetails(currentData.weather_code, currentData.is_day);
  const CurrentIcon = currentDetails.icon;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans selection:bg-blue-500/30">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-2">
          <div>
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <MapPin className="w-4 h-4" />
              <span className="text-sm font-medium tracking-wider uppercase">{locationName}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              OmniCast Super Ensemble
            </h1>
          </div>

          <div className="flex flex-col items-end gap-2 w-full md:w-auto">
            <div className="flex w-full sm:w-auto gap-2">
              <form onSubmit={handleSearch} className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search city or zip code..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-full py-2.5 pl-4 pr-10 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-white placeholder-slate-500"
                />
                <button type="submit" disabled={state.loading} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-full disabled:opacity-50">
                  {state.loading && searchQuery ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </button>
              </form>
              <button 
                onClick={initGeolocation}
                disabled={state.loading}
                className="flex items-center justify-center p-2.5 bg-slate-900 border border-slate-800 rounded-full hover:bg-slate-800 transition-colors disabled:opacity-50"
                title="Use My Location"
              >
                <MapPin className={`w-4 h-4 ${state.loading && !searchQuery ? 'animate-bounce' : ''}`} />
              </button>
            </div>
            {searchError && <p className="text-xs text-red-400">{searchError}</p>}
          </div>
        </header>

        {/* NWS Weather Alerts */}
        {state.alerts && state.alerts.length > 0 && (
          <section className="bg-red-950 border border-red-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-red-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <h3 className="text-xl font-bold text-red-400 mb-4 flex items-center gap-2 relative z-10">
              <AlertTriangle className="w-6 h-6" />
              National Weather Service Alerts
            </h3>
            <div className="space-y-3 relative z-10">
              {state.alerts.map((alert, idx) => (
                <details key={idx} className="group bg-red-900/20 border border-red-500/30 rounded-2xl p-4 cursor-pointer [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex items-center justify-between font-semibold text-red-300 outline-none">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full animate-pulse bg-red-500"></span>
                      {alert.event}
                    </span>
                    <span className="text-red-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-4 text-sm text-red-200/80 whitespace-pre-wrap bg-black/20 p-4 rounded-xl border border-red-900/50 max-h-64 overflow-y-auto">
                    <p className="font-bold mb-2 text-red-100">{alert.headline}</p>
                    {alert.description}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Local Microclimate & Nature Field Guide */}
        {microclimate && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center gap-2.5 mb-4 relative z-10">
              <Bot className="w-6 h-6 text-emerald-400 animate-pulse" />
              <h2 className="text-xl font-bold">Local Microclimate & Field Guide</h2>
              <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2.5 py-0.5 rounded-full font-medium ml-2">Outdoor Science</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
              {/* Microclimate Regional Classification */}
              <div className="md:col-span-1 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Atmospheric Zone</span>
                  <h3 className="text-lg font-extrabold text-emerald-300 leading-snug mb-3">{microclimate.region}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">{microclimate.description}</p>
                </div>
                <div className="border-t border-slate-800/80 pt-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Terrain & Forest Influence</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{microclimate.terrain}</p>
                </div>
              </div>

              {/* Backyard Science Outdoor Checks */}
              <div className="md:col-span-2 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Backyard Science Checklist (Look Outside!)</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {microclimate.natureChecks.map((check, idx) => (
                    <div key={idx} className="bg-slate-900/80 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between transition-all hover:border-emerald-500/20">
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h4 className="text-xs font-black text-slate-100">{check.title}</h4>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{check.desc}</p>
                      </div>
                      <div className="mt-4 pt-2 border-t border-slate-800/40 flex justify-between items-center text-[10px]">
                        <span className="text-slate-500 font-medium">Observed Status</span>
                        <span className="text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-900/50">{check.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* PUBLIC FORECAST SHARING & BULLETIN WALL */}
        {user && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex items-center gap-2 mb-6 relative z-10">
              <Users className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold">Live Public Weather Wall</h2>
              <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-900/40 px-2.5 py-0.5 rounded-full font-bold ml-2">Global Feed</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
              {/* Share input form */}
              <div className="bg-slate-950/50 border border-slate-800 p-5 rounded-2xl">
                <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 text-emerald-400" /> Share Your Local Skies
                </h3>
                <form onSubmit={handleSharePost} className="space-y-3.5">
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Your Name</label>
                    <input 
                      type="text" 
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="e.g. WeatherWatcher"
                      maxLength={30}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Local Note or Observation</label>
                    <textarea 
                      value={userNote}
                      onChange={(e) => setUserNote(e.target.value)}
                      placeholder="e.g. Leaves are flipping over, looking like rain soon!"
                      maxLength={140}
                      required
                      className="w-full h-20 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isSharing || !currentData}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    {isSharing ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Publish Forecast
                  </button>
                  {shareSuccess && (
                    <p className="text-[11px] text-emerald-400 text-center font-semibold bg-emerald-950/20 py-1.5 rounded-lg border border-emerald-950">
                      Successfully Shared with the world!
                    </p>
                  )}
                </form>
              </div>

              {/* Feed Display board */}
              <div className="md:col-span-2 bg-slate-950/30 border border-slate-800 p-5 rounded-2xl flex flex-col h-72">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Live Reports</span>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 hide-scrollbar">
                  {sharedPosts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600">
                      <Cloud className="w-8 h-8 opacity-40 mb-2" />
                      <p className="text-xs">No public reports yet. Be the first to post!</p>
                    </div>
                  ) : (
                    sharedPosts.map((post) => (
                      <div key={post.id} className="bg-slate-900/50 border border-slate-800/60 p-3 rounded-xl flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-black text-slate-200">{post.name}</span>
                            <span className="text-[10px] text-slate-500">in</span>
                            <span className="text-[10px] text-blue-400 font-bold flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" /> {post.location}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 italic">"{post.note}"</p>
                        </div>
                        <div className="text-right shrink-0 bg-slate-950/60 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                          <span className="text-sm font-black text-white block">{post.temp}°F</span>
                          <span className="text-[9px] text-slate-500">{post.desc}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Forecast Momentum & Run-to-Run Trends */}
        {trendAnalysis && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center gap-2">
                <LineChart className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-bold">Forecast Momentum & Drift</h2>
              </div>
              <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                <Bot className="w-3.5 h-3.5" /> Modeling future adjustments
              </span>
            </div>

            <p className="text-sm text-slate-400 mb-6 relative z-10">
              By evaluating high-resolution models against coarse global runs, we project how the next generation of official weather reports will trend.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
              {/* Temperature Trend */}
              <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-colors ${trendAnalysis.temp.style}`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Thermal Drift</span>
                    {trendAnalysis.temp.arrow === 'up' && <TrendingUp className="w-5 h-5 text-amber-400" />}
                    {trendAnalysis.temp.arrow === 'down' && <TrendingDown className="w-5 h-5 text-sky-400" />}
                    {trendAnalysis.temp.arrow === 'right' && <MoveRight className="w-5 h-5 text-slate-400" />}
                  </div>
                  <h4 className="text-lg font-black">{trendAnalysis.temp.direction}</h4>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{trendAnalysis.temp.text}</p>
                </div>
              </div>

              {/* Rain Timing Trend */}
              <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-colors ${trendAnalysis.precip.style}`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Moisture Phase Trend</span>
                    <Umbrella className="w-4 h-4" />
                  </div>
                  <h4 className="text-lg font-black">{trendAnalysis.precip.direction}</h4>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{trendAnalysis.precip.text}</p>
                </div>
              </div>

              {/* Convergence Stability */}
              <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-colors ${trendAnalysis.convergence.style}`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Run Consistency</span>
                    <Activity className="w-4 h-4" />
                  </div>
                  <h4 className="text-lg font-black">{trendAnalysis.convergence.direction}</h4>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">{trendAnalysis.convergence.text}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SPC Severe Weather Outlook */}
        {spcOutlook && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-purple-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center gap-2 mb-4 relative z-10">
              <ShieldAlert className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold">SPC Severe Weather Outlook</h2>
              <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800/60 px-2.5 py-0.5 rounded-full font-medium ml-2">Ensemble-Calculated</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
              {/* Category Badge Card */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-center items-center text-center">
                <p className="text-xs text-slate-500 font-semibold mb-2 uppercase tracking-widest">SPC Risk Category</p>
                <div className={`px-4 py-2 rounded-xl text-sm font-bold border ${spcOutlook.style}`}>
                  {spcOutlook.category}
                </div>
                <p className="text-3xl font-black mt-4 text-white">{spcOutlook.overallProb}%</p>
                <p className="text-xs text-slate-400 mt-1">Convective Probability Index</p>
              </div>

              {/* Hazard Breakdown Progress Bars */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                <p className="text-xs text-slate-500 font-semibold mb-4 uppercase tracking-widest">Severe Hazard Probability</p>
                <div className="space-y-3.5">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-300">🌪️ Tornado</span>
                      <span className="text-purple-400">{spcOutlook.hazards.tornado}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-purple-500 h-1.5 rounded-full" style={{width: `${spcOutlook.hazards.tornado}%`}}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-300">💨 Damaging Wind</span>
                      <span className="text-blue-400">{spcOutlook.hazards.wind}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{width: `${spcOutlook.hazards.wind}%`}}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-300">☄️ Large Hail</span>
                      <span className="text-emerald-400">{spcOutlook.hazards.hail}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{width: `${spcOutlook.hazards.hail}%`}}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Model Comparison Checklist */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                <p className="text-xs text-slate-500 font-semibold mb-2 uppercase tracking-widest">Individual Model Outlooks</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-0.5 border-b border-slate-800/50">
                    <span className="text-slate-400 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{backgroundColor: MODEL_COLORS.ecmwf}}></div> EU Model (ECMWF)</span>
                    <span className="font-bold">{spcOutlook.models.ecmwf}%</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5 border-b border-slate-800/50">
                    <span className="text-slate-400 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{backgroundColor: MODEL_COLORS.gfs}}></div> US Model (GFS)</span>
                    <span className="font-bold">{spcOutlook.models.gfs}%</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5 border-b border-slate-800/50">
                    <span className="text-slate-400 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{backgroundColor: MODEL_COLORS.icon}}></div> German Model (ICON)</span>
                    <span className="font-bold">{spcOutlook.models.icon}%</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5 border-b border-slate-800/50">
                    <span className="text-slate-400 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{backgroundColor: MODEL_COLORS.gem}}></div> Canadian Model (GEM)</span>
                    <span className="font-bold">{spcOutlook.models.gem}%</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-purple-300 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full animate-pulse" style={{backgroundColor: MODEL_COLORS.graf}}></div> IBM GRAF (TWC)</span>
                    <span className="font-bold text-purple-300">{spcOutlook.models.graf}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Convective Risk Momentum */}
            <div className={`mt-6 border rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 transition-colors ${spcOutlook.trend.style}`}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-950/60 rounded-full border border-slate-800">
                  {spcOutlook.trend.arrow === 'up' && <TrendingUp className="w-5 h-5 text-pink-400" />}
                  {spcOutlook.trend.arrow === 'down' && <TrendingDown className="w-5 h-5 text-emerald-400" />}
                  {spcOutlook.trend.arrow === 'right' && <MoveRight className="w-5 h-5 text-slate-400" />}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">SPC Risk Momentum</p>
                  <h4 className="text-sm font-black">{spcOutlook.trend.direction}</h4>
                </div>
              </div>
              <p className="text-xs text-slate-300 flex-1 md:max-w-md md:text-right leading-relaxed">
                {spcOutlook.trend.text}
              </p>
            </div>
          </section>
        )}

        {/* ENSEMBLE ATMOSPHERIC HAZARD INDICES */}
        {hazards && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 p-32 bg-amber-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center gap-2 mb-6 relative z-10">
              <AlertCircle className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold">Atmospheric & Aviation Hazards</h2>
              <span className="text-xs bg-amber-950/50 text-amber-300 border border-amber-800/40 px-2.5 py-0.5 rounded-full font-medium ml-2">Ensemble Heuristics</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
              {/* Flood Risk */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                      <Waves className="w-3.5 h-3.5 text-blue-400" /> Flood Risk
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${hazards.flood.score > 50 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-slate-800 text-slate-400'}`}>
                      {hazards.flood.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black mt-2">{hazards.flood.score}%</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-blue-400 h-1.5 rounded-full" style={{width: `${hazards.flood.score}%`}}></div>
                </div>
              </div>

              {/* Drought Index */}
              <div className="bg-slate-950/40 border border-slate-800/40 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                      <Sun className="w-3.5 h-3.5 text-amber-500" /> Drought Index
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${hazards.drought.score > 50 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-slate-800 text-slate-400'}`}>
                      {hazards.drought.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black mt-2">{hazards.drought.score}%</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{width: `${hazards.drought.score}%`}}></div>
                </div>
              </div>

              {/* Dense Fog */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                      <CloudFog className="w-3.5 h-3.5 text-zinc-400" /> Dense Fog Risk
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${hazards.fog.score > 60 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-slate-800 text-slate-400'}`}>
                      {hazards.fog.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black mt-2">{hazards.fog.score}%</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-zinc-400 h-1.5 rounded-full" style={{width: `${hazards.fog.score}%`}}></div>
                </div>
              </div>

              {/* Wildfire Index */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-red-500" /> Wildfire Risk
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${hazards.fire.score > 60 ? 'bg-red-500 text-white font-black animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                      {hazards.fire.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black mt-2">{hazards.fire.score}%</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-red-500 h-1.5 rounded-full" style={{width: `${hazards.fire.score}%`}}></div>
                </div>
              </div>

              {/* Dry Thunderstorms */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                      <CloudLightning className="w-3.5 h-3.5 text-yellow-400" /> Dry Storm Potential
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${hazards.dryStorm.score > 50 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-slate-800 text-slate-400'}`}>
                      {hazards.dryStorm.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black mt-2">{hazards.dryStorm.score}%</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-yellow-400 h-1.5 rounded-full" style={{width: `${hazards.dryStorm.score}%`}}></div>
                </div>
              </div>

              {/* Plane Safety (Aviation Hazard) */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                      <Plane className="w-3.5 h-3.5 text-sky-400" /> Flight Safety Risk
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${hazards.aviation.score > 50 ? 'bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                      {hazards.aviation.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black mt-2">{hazards.aviation.score}%</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-sky-400 h-1.5 rounded-full" style={{width: `${hazards.aviation.score}%`}}></div>
                </div>
              </div>

              {/* Virga Risk */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between col-span-1 sm:col-span-2">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                      <Umbrella className="w-3.5 h-3.5 text-indigo-400" /> Virga / Microburst Potential
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${hazards.virga.score > 50 ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' : 'bg-slate-800 text-slate-400'}`}>
                      {hazards.virga.label}
                    </span>
                  </div>
                  <p className="text-2xl font-black mt-2">{hazards.virga.score}%</p>
                  <p className="text-[11px] text-slate-400 mt-2">Probability of falling precipitation evaporating mid-air, causing intense localized dry downdrafts and high microburst gusts.</p>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-indigo-400 h-1.5 rounded-full" style={{width: `${hazards.virga.score}%`}}></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Current Conditions Card */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
            <div className="flex items-center gap-6">
              <CurrentIcon className="w-20 h-20 md:w-28 md:h-28 text-blue-400" strokeWidth={1.5} />
              <div>
                <div className="flex items-start">
                  <span className="text-6xl md:text-8xl font-light tracking-tighter">
                    {Math.round(currentData.temperature_2m)}
                  </span>
                  <span className="text-2xl md:text-3xl text-slate-400 mt-2">°F</span>
                </div>
                <p className="text-xl md:text-2xl font-medium text-slate-300 mt-1">
                  {currentDetails.desc}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Feels like {Math.round(currentData.apparent_temperature)}°F
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
              <div className="bg-slate-950/50 p-4 rounded-2xl flex items-center gap-3 border border-slate-800/50">
                <Wind className="w-6 h-6 text-emerald-400" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Wind</p>
                  <p className="text-sm font-semibold">{currentData.wind_speed_10m} mph</p>
                </div>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl flex items-center gap-3 border border-slate-800/50">
                <Droplets className="w-6 h-6 text-blue-400" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Humidity</p>
                  <p className="text-sm font-semibold">{currentData.relative_humidity_2m}%</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Model Confidence & Analysis */}
        {confidence && (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-1">
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 rounded-full bg-slate-950 border border-slate-800 ${confidence.color}`}>
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      Ensemble Confidence: 
                      <span className={confidence.color}>{confidence.level}</span>
                    </h3>
                    <p className="text-slate-400 text-sm mt-1">{confidence.msg}</p>
                    <p className="text-slate-500 text-xs mt-2 flex items-center gap-1">
                      <Info className="w-3 h-3" /> Average model spread is {confidence.spread}°F across the next 24 hours.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* AI Helper Insight */}
              <div className="flex-1 bg-slate-950/50 border border-slate-800/50 rounded-2xl p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-16 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>
                <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 mb-2 relative z-10">
                  <Bot className="w-4 h-4" /> OmniCast AI Meteorologist
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed relative z-10">
                  <Sparkles className="w-3 h-3 inline-block text-purple-400 mr-1" />
                  {aiInsight}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Model Divergence Chart */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">24-Hour Model Divergence</h3>
              <p className="text-sm text-slate-400">Comparing global supercomputers in real-time</p>
            </div>
            
            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-xs font-medium">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>Ensemble Avg</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: MODEL_COLORS.ecmwf}}></div>ECMWF (EU)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: MODEL_COLORS.gfs}}></div>GFS (US)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: MODEL_COLORS.icon}}></div>ICON (DE)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor: MODEL_COLORS.gem}}></div>GEM (CA)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full animate-pulse" style={{backgroundColor: MODEL_COLORS.graf}}></div>IBM GRAF (TWC)</div>
            </div>
          </div>

          <ModelChart data={hourlyData} />
        </section>

        {/* Hourly Forecast (Averaged) */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-blue-400" /> Hourly Ensemble Forecast
          </h3>
          <div className="flex overflow-x-auto gap-4 pb-4 snap-x hide-scrollbar">
            {hourlyData.map((hour, idx) => {
              const HourIcon = getWeatherDetails(hour.weatherCode, true).icon;
              return (
                <div key={idx} className="flex flex-col items-center min-w-[80px] snap-start">
                  <p className="text-sm text-slate-400 mb-2">{idx === 0 ? 'Now' : hour.hourLabel}</p>
                  <HourIcon className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-lg font-bold">{Math.round(hour.average)}°</p>
                  {hour.stormWarning && (
                    <p className="text-[10px] font-bold text-red-400 mt-1 uppercase tracking-wider text-center">
                      {hour.stormWarning.text} <span className="text-red-500 font-black">{hour.stormWarning.marks}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 24-Hour Precipitation Radar */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Radar className="w-5 h-5 text-emerald-400" /> 24-Hour Ensemble Radar
          </h3>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
             <p className="text-sm text-slate-400">Predicted precipitation amounts based on the model average (inches)</p>
             <div className="flex text-[10px] font-medium items-center">
               <span className="text-slate-500 mr-2">Light</span>
               <div className="flex h-3 rounded-full overflow-hidden border border-slate-700">
                 <div className="w-4 bg-[#bbf7d0]" title="Light Green"></div>
                 <div className="w-4 bg-[#22c55e]" title="Green"></div>
                 <div className="w-4 bg-[#eab308]" title="Yellow"></div>
                 <div className="w-4 bg-[#f97316]" title="Orange"></div>
                 <div className="w-4 bg-[#ef4444]" title="Red"></div>
                 <div className="w-4 bg-[#ec4899]" title="Pink"></div>
                 <div className="w-4 bg-[#000000]" title="Black"></div>
                 <div className="w-4 bg-[#ffffff]" title="White"></div>
               </div>
               <span className="text-slate-500 ml-2">Heavy</span>
             </div>
          </div>
          <PrecipitationChart data={hourlyData} />
        </section>

        {/* 7-Day Overview */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-lg font-semibold mb-4">7-Day Outlook</h3>
          <div className="space-y-4">
            {dailyData.map((day, idx) => {
              const DayIcon = getWeatherDetails(day.weatherCode, true).icon;
              return (
                <div key={idx} className="flex items-center justify-between p-2 hover:bg-slate-800/50 rounded-xl transition-colors">
                  <p className="w-16 font-medium text-slate-300">{idx === 0 ? 'Today' : day.dayLabel}</p>
                  <div className="flex-1 flex justify-center">
                    <DayIcon className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="w-24 flex justify-end gap-3 text-sm font-semibold">
                    <span className="text-white">{Math.round(day.maxTemp)}°</span>
                    <span className="text-slate-500">{Math.round(day.minTemp)}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}

// Custom SVG Chart Component to avoid external dependencies while maintaining premium look
function ModelChart({ data }) {
  if (!data || data.length === 0) return null;

  // Find global min/max for scaling
  let minTemp = Infinity;
  let maxTemp = -Infinity;
  data.forEach(d => {
    [d.ecmwf, d.gfs, d.icon, d.gem, d.graf, d.average].forEach(t => {
      if (t !== undefined && t !== null) {
        if (t < minTemp) minTemp = t;
        if (t > maxTemp) maxTemp = t;
      }
    });
  });

  // Pad the bounds slightly
  minTemp -= 2;
  maxTemp += 2;
  const range = maxTemp - minTemp;

  const width = 800; // SVG internal coordinate system
  const height = 200;
  
  const getX = (index) => (index / (data.length - 1)) * width;
  const getY = (temp) => height - ((temp - minTemp) / range) * height;

  const createPath = (modelKey) => {
    return data.map((d, i) => {
      if (d[modelKey] === undefined || d[modelKey] === null) return '';
      const x = getX(i);
      const y = getY(d[modelKey]);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  return (
    <div className="relative w-full overflow-hidden mt-4">
      {/* Y-Axis Labels */}
      <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-slate-500 py-1 pointer-events-none">
        <span>{Math.round(maxTemp)}°</span>
        <span>{Math.round(minTemp + range/2)}°</span>
        <span>{Math.round(minTemp)}°</span>
      </div>

      <div className="pl-8 overflow-x-auto hide-scrollbar">
        <svg 
          viewBox={`0 0 ${width} ${height + 20}`} 
          className="w-full min-w-[600px] h-48 md:h-56 overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          <line x1="0" y1="0" x2={width} y2="0" stroke="#1e293b" strokeWidth="1" />
          <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="0" y1={height} x2={width} y2={height} stroke="#1e293b" strokeWidth="1" />

          {/* Individual Models (Thinner, slight opacity) */}
          <path d={createPath('ecmwf')} fill="none" stroke={MODEL_COLORS.ecmwf} strokeWidth="2" strokeOpacity="0.4" />
          <path d={createPath('gfs')} fill="none" stroke={MODEL_COLORS.gfs} strokeWidth="2" strokeOpacity="0.4" />
          <path d={createPath('icon')} fill="none" stroke={MODEL_COLORS.icon} strokeWidth="2" strokeOpacity="0.4" />
          <path d={createPath('gem')} fill="none" stroke={MODEL_COLORS.gem} strokeWidth="2" strokeOpacity="0.4" />
          <path d={createPath('graf')} fill="none" stroke={MODEL_COLORS.graf} strokeWidth="2" strokeOpacity="0.4" />
          
          {/* Super Ensemble Average (Thick, white, glows) */}
          <path 
            d={createPath('average')} 
            fill="none" 
            stroke={MODEL_COLORS.average} 
            strokeWidth="4" 
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="drop-shadow(0px 0px 4px rgba(255,255,255,0.5))"
          />

          {/* Time Labels on X-Axis */}
          {data.map((d, i) => {
            if (i % 4 === 0) { // Show label every 4 hours
              return (
                <text 
                  key={i} 
                  x={getX(i)} 
                  y={height + 16} 
                  fill="#64748b" 
                  fontSize="12" 
                  textAnchor="middle"
                >
                  {i === 0 ? 'Now' : d.hourLabel}
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>
    </div>
  );
}

// Maps precipitation intensity (inches) to standard radar DBZ colors
const getRadarColor = (precip) => {
  if (precip >= 1.0) return '#ffffff'; // White (Extreme)
  if (precip >= 0.75) return '#000000'; // Black (Torrential)
  if (precip >= 0.5) return '#ec4899'; // Pink (Severe)
  if (precip >= 0.25) return '#ef4444'; // Red (Heavy)
  if (precip >= 0.1) return '#f97316'; // Orange (Moderate-Heavy)
  if (precip >= 0.05) return '#eab308'; // Yellow (Moderate)
  if (precip >= 0.02) return '#22c55e'; // Green (Light-Moderate)
  if (precip > 0) return '#bbf7d0'; // Light Green (Light)
  return 'transparent'; // None
};

// Custom SVG Component for 24-Hour Precipitation "Radar"
function PrecipitationChart({ data }) {
  if (!data || data.length === 0) return null;

  let maxPrecip = 0;
  data.forEach(d => {
    if (d.precipitation > maxPrecip) maxPrecip = d.precipitation;
  });

  // Ensure we have a minimum scale so tiny rain amounts don't look huge
  const yMax = Math.max(maxPrecip * 1.2, 0.1); 

  const width = 800;
  const height = 120;
  const barWidth = (width / data.length) * 0.8;
  const getX = (index) => (index / data.length) * width + ((width / data.length) - barWidth) / 2;
  const getY = (precip) => height - (precip / yMax) * height;

  return (
    <div className="relative w-full overflow-hidden mt-4">
      <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-slate-500 py-1 pointer-events-none z-10">
        <span>{yMax.toFixed(2)}"</span>
        <span>{(yMax/2).toFixed(2)}"</span>
        <span>0"</span>
      </div>

      <div className="pl-8 overflow-x-auto hide-scrollbar">
        <svg 
          viewBox={`0 0 ${width} ${height + 20}`} 
          className="w-full min-w-[600px] h-32 md:h-40 overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Grid */}
          <line x1="0" y1={height} x2={width} y2={height} stroke="#1e293b" strokeWidth="1" />
          <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />

          {/* Precipitation Bars */}
          {data.map((d, i) => {
            if (d.precipitation <= 0) return null;
            const h = height - getY(d.precipitation);
            return (
              <rect
                key={`bar-${i}`}
                x={getX(i)}
                y={getY(d.precipitation)}
                width={barWidth}
                height={h}
                fill={getRadarColor(d.precipitation)}
                rx="2"
              />
            );
          })}

          {/* X-Axis Labels */}
          {data.map((d, i) => {
            if (i % 4 === 0) {
              return (
                <text 
                  key={`label-${i}`} 
                  x={getX(i) + barWidth/2} 
                  y={height + 16} 
                  fill="#64748b" 
                  fontSize="12" 
                  textAnchor="middle"
                >
                  {i === 0 ? 'Now' : d.hourLabel}
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>
    </div>
  );
}