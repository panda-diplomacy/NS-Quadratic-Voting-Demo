import { useState, useMemo, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { 
Vote, 
Wallet, 
ChevronRight, 
ArrowLeft, 
Plus, 
Minus, 
CheckCircle2, 
QrCode,
Info,
Trophy,
Users,
AlertCircle,
Flame,
Calendar,
UserPlus,
Presentation,
Calculator,
Globe,
ShieldAlert,
ShieldCheck,
TrendingUp,
Target,
Zap
} from 'lucide-react';
import { cn } from './utils';
import { Proposal, VoteAllocation } from './types';
const PROPOSALS: Proposal[] = [
{
    id: 'ns-budget-2026',
    title: 'NS Discretionary Budget April 2026',
    description: 'Allocate your identity points to decide how the discretionary budget should be spent this month.',
    status: 'open',
    options: [
{ id: 'cafe', name: 'Free NS Cafe' },
{ id: 'snack-bar', name: '24/7 Free Snack Bar' },
{ id: 'scooters', name: 'Free scooters to use in Forest City' },
{ id: 'dance', name: 'Hiring a full-time dance instructor' },
{ id: 'claude', name: 'A Free Claude Pro Subscription for all NSers' },
],
},
];
const TARGET_BUDGETS: Record<string, number> = {
'cafe': 7000,
'snack-bar': 10000,
'scooters': 7500,
'dance': 6500,
'claude': 9400
};
const QF_POOL = 25000;

const MAX_VALUES = {
  hosted: 5,
  attended: 15,
  burns: 12,
  referrals: 5
};

const WEIGHTS = {
  hosted: 2,
  attended: 0.5,
  burns: 1,
  referrals: 4
};
interface Contribution {
  userId: string;
  votes: number;
  weight: number;
}
interface GlobalState {
  proposals: {
[optionId: string]: Contribution[];
};
  vetoes: {
    userId: string;
    weight: number;
}[];
  participants: {
[userId: string]: number;
};
  isClosed: boolean;
  finalAllocations?: {
    [optionId: string]: number;
  };
}
export default function App() {
const [view, setView] = useState<'identity' | 'list' | 'vote' | 'success' | 'qr' | 'overview'>('identity');
const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
const [allocations, setAllocations] = useState<VoteAllocation>({});
const [hasLoadedInitialVotes, setHasLoadedInitialVotes] = useState(false);
const [appUrl, setAppUrl] = useState('');
const [globalState, setGlobalState] = useState<GlobalState>({
    proposals: {},
    vetoes: [],
    participants: {},
    isClosed: false
});
const [identityInputs, setIdentityInputs] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('ns_identity_inputs');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        hosted: String(parsed.hosted || ''),
        attended: String(parsed.attended || ''),
        burns: String(parsed.burns || ''),
        referrals: String(parsed.referrals || '')
      };
    }
    return {
        hosted: '',
        attended: '',
        burns: '',
        referrals: ''
    };
});
const identityScore = useMemo(() => {
    const hosted = Number(identityInputs.hosted) || 0;
    const attended = Number(identityInputs.attended) || 0;
    const burns = Number(identityInputs.burns) || 0;
    const referrals = Number(identityInputs.referrals) || 0;
    
    return Math.floor(
        (hosted * WEIGHTS.hosted) + 
        (attended * WEIGHTS.attended) + 
        (burns * WEIGHTS.burns) + 
        (referrals * WEIGHTS.referrals)
    );
}, [identityInputs]);
const [identityError, setIdentityError] = useState<string | null>(null);
const [vetoed, setVetoed] = useState(false);
const [timeLeft, setTimeLeft] = useState(72 * 3600); // 72 hours in seconds
  useEffect(() => {
const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
}, 1000);
return () => clearInterval(timer);
}, []);
const formatTime = (seconds: number) => {
const h = Math.floor(seconds / 3600);
const m = Math.floor((seconds % 3600) / 60);
const s = seconds % 60;
return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};
const [userId] = useState(() => {
const saved = localStorage.getItem('ns_user_id');
if (saved) return saved;
const newId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ns_user_id', newId);
return newId;
});

  // Sync local allocations with globalState once on load
  useEffect(() => {
    if (!hasLoadedInitialVotes && Object.keys(globalState.proposals).length > 0) {
      const initialAllocations: VoteAllocation = {};
      Object.entries(globalState.proposals).forEach(([optionId, contributions]) => {
        const userCont = (contributions as Contribution[]).find(c => c.userId === userId);
        if (userCont) {
          initialAllocations[optionId] = userCont.votes;
        }
      });
      setAllocations(initialAllocations);
      
      // Also sync veto status
      const userVeto = globalState.vetoes.find(v => v.userId === userId);
      if (userVeto) setVetoed(true);
      
      setHasLoadedInitialVotes(true);
    }
  }, [globalState, userId, hasLoadedInitialVotes]);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectWebSocket = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connected');
      setSocketStatus('open');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log('Received socket payload:', payload.type);
        if (payload.type === 'SYNC') {
          console.log('Syncing global state:', payload.data);
          setGlobalState(payload.data);
        }
      } catch (err) {
        console.error('Error parsing socket message:', err);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket closed, attempting reconnect...');
      setSocketStatus('closed');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      socket.close();
    };
  };

  useEffect(() => {
    setAppUrl(window.location.href);
    connectWebSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);
const totalCreditsUsed = useMemo(() => {
return Object.values(allocations).reduce((sum: number, votes: number) => sum + (votes * votes), 0);
}, [allocations]);
const remainingCredits = identityScore - totalCreditsUsed;
const qfResults = useMemo(() => {
const results: Record<string, { score: number, allocation: number, totalVotes: number }> = {};
let totalVotesAcrossAll = 0;
Object.keys(TARGET_BUDGETS).forEach(id => {
const contributions = globalState.proposals[id] || [];
const totalVotes = contributions.reduce((sum: number, c) => sum + c.votes, 0);
// Using total votes as the score for linear allocation of the $25,000 pool
results[id] = { score: totalVotes, allocation: 0, totalVotes };
totalVotesAcrossAll += totalVotes;
});

if (globalState.isClosed && globalState.finalAllocations) {
  Object.keys(results).forEach(id => {
    results[id].allocation = globalState.finalAllocations![id] || 0;
  });
} else if (totalVotesAcrossAll > 0) {
Object.keys(results).forEach(id => {
const res = results[id];
         // Allocation = (Votes for project / Total votes across all) * Pool
         res.allocation = (res.totalVotes / totalVotesAcrossAll) * QF_POOL;
});
}
console.log('Calculated Results:', results);
return results;
}, [globalState]);
const vetoStats = useMemo(() => {
const totalVetoWeight = globalState.vetoes.reduce((sum: number, v) => sum + v.weight, 0);
const totalParticipantWeight = (Object.values(globalState.participants) as number[]).reduce((sum: number, w) => sum + w, 0);
const percentage = totalParticipantWeight > 0 ? (totalVetoWeight / totalParticipantWeight) * 100 : 0;
return {
      totalVetoWeight,
      totalParticipantWeight,
      percentage,
      isVetoed: percentage >= 20
};
}, [globalState]);
const handleIdentitySubmit = (e: any) => {
    e.preventDefault();
    
    const hosted = Number(identityInputs.hosted) || 0;
    const attended = Number(identityInputs.attended) || 0;
    const burns = Number(identityInputs.burns) || 0;
    const referrals = Number(identityInputs.referrals) || 0;

    if (hosted > MAX_VALUES.hosted || 
        attended > MAX_VALUES.attended || 
        burns > MAX_VALUES.burns || 
        referrals > MAX_VALUES.referrals) {
      setIdentityError("Please include a realistic number for the demo.");
      return;
    }

    localStorage.setItem('ns_identity_score', identityScore.toString());
    localStorage.setItem('ns_identity_inputs', JSON.stringify({ 
      hosted: String(hosted), 
      attended: String(attended), 
      burns: String(burns), 
      referrals: String(referrals) 
    }));
    setIdentityError(null);
    setView('list');
};
const handleVoteChange = (optionId: string, delta: number) => {
const currentVotes = allocations[optionId] || 0;
const nextVotes = Math.max(0, currentVotes + delta);
const currentCost = currentVotes * currentVotes;
const nextCost = nextVotes * nextVotes;
const costDiff = nextCost - currentCost;
if (remainingCredits - costDiff >= 0) {
      setAllocations(prev => ({
...prev,
[optionId]: nextVotes
}));
}
};
  const handleProposalSelect = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    // We already sync allocations in useEffect, so we don't need to reset it here
    // unless we want to ensure it's up to date with globalState for this specific user
    setView('vote');
  };
const handleSubmit = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log('Submitting votes:', { userId, allocations, identityScore, vetoed });
      socketRef.current.send(JSON.stringify({
        type: 'VOTE',
        data: { 
          userId,
          allocations, 
          weight: identityScore,
          vetoed
        }
      }));
      setView('success');
    } else {
      console.error('Cannot submit: WebSocket is not open. Status:', socketStatus);
      alert('Connection lost. Please wait a moment and try again.');
    }
};
return (
<div className="min-h-screen bg-[#faf8f5] text-[#0a0a0a] font-sans selection:bg-[#1a4d3d] selection:text-white overflow-x-hidden" style={{backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(26, 77, 61, 0.03) 0%, transparent 50%)'}}>
{/* Header */}
<header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-md border-b border-[#0a0a0a]/8 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center shadow-sm">
<div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('identity')}>
<div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#0a0a0a] rounded-lg flex items-center justify-center">
<Vote className="text-white" size={16} />
</div>
<h1 className="font-serif font-bold text-lg sm:text-xl tracking-tight text-[#0a0a0a] line-clamp-1">The Quadratic Simulation</h1>
</div>
<div className="flex items-center gap-2 sm:gap-4">
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1a4d3d]/5 border border-[#1a4d3d]/10">
    <Users size={12} className="text-[#1a4d3d]" />
    <span className="text-[10px] font-mono font-bold text-[#1a4d3d]">{Object.keys(globalState.participants).length}</span>
  </div>
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#0a0a0a]/5 border border-[#0a0a0a]/5">
    <div className={cn(
      "w-1.5 h-1.5 rounded-full",
      socketStatus === 'open' ? "bg-emerald-500" : socketStatus === 'connecting' ? "bg-yellow-500 animate-pulse" : "bg-red-500"
    )} />
    <span className="text-[8px] font-bold uppercase tracking-widest text-[#0a0a0a]/40">
      {socketStatus === 'open' ? "Live" : socketStatus === 'connecting' ? "Connecting" : "Offline"}
    </span>
  </div>
<button 
            onClick={() => setView('overview')}
            className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#0a0a0a]/5 hover:bg-[#0a0a0a]/10 transition-all text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#1a4d3d]"
>
<Globe size={12} />
<span className="hidden sm:inline">Overview</span>
</button>
<button 
            onClick={() => setView('qr')}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-[#0a0a0a]/10 flex items-center justify-center hover:bg-[#0a0a0a]/5 transition-all text-[#1a4d3d]"
>
<QrCode size={18} />
</button>
</div>
</header>
<main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
<AnimatePresence mode="wait">
{view === 'identity' && (
<motion.div
              key="identity"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 sm:space-y-8"
>
<div className="space-y-2 text-center">
<h2 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-[#0a0a0a] leading-tight">Proof of Work - March Score</h2>
<p className="text-sm sm:text-base text-[#0a0a0a]/55">Calculate your identity points based on your contributions this month. Your total credits will be converted to quadratic votes.</p>
</div>

<form onSubmit={handleIdentitySubmit} className="bg-white p-6 sm:p-8 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-6">
  {identityError && (
    <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-900 text-sm animate-shake">
      <AlertCircle size={18} className="shrink-0" />
      {identityError}
    </div>
  )}
  <div className="grid gap-6 sm:grid-cols-2">
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
        <Presentation size={14} />
        Events Hosted
      </label>
      <input
        type="number"
        min="0"
        max={MAX_VALUES.hosted}
        placeholder="0"
        value={identityInputs.hosted}
        onChange={(e) => {
          setIdentityInputs(prev => ({ ...prev, hosted: e.target.value }));
          setIdentityError(null);
        }}
        className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono disabled:opacity-50"
      />
    </div>
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
        <Calendar size={14} />
        Events Attended
      </label>
      <input
        type="number"
        min="0"
        max={MAX_VALUES.attended}
        placeholder="0"
        value={identityInputs.attended}
        onChange={(e) => {
          setIdentityInputs(prev => ({ ...prev, attended: e.target.value }));
          setIdentityError(null);
        }}
        className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono disabled:opacity-50"
      />
    </div>
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
        <Flame size={14} />
        Burns
      </label>
      <input
        type="number"
        min="0"
        max={MAX_VALUES.burns}
        placeholder="0"
        value={identityInputs.burns}
        onChange={(e) => {
          setIdentityInputs(prev => ({ ...prev, burns: e.target.value }));
          setIdentityError(null);
        }}
        className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono disabled:opacity-50"
      />
    </div>
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
        <UserPlus size={14} />
        Referrals
      </label>
      <input
        type="number"
        min="0"
        max={MAX_VALUES.referrals}
        placeholder="0"
        value={identityInputs.referrals}
        onChange={(e) => {
          setIdentityInputs(prev => ({ ...prev, referrals: e.target.value }));
          setIdentityError(null);
        }}
        className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono disabled:opacity-50"
      />
    </div>
  </div>
  <div className="pt-4 border-t border-[#0a0a0a]/5 flex items-center justify-between">
  <div className="space-y-1">
  <p className="text-[10px] uppercase tracking-widest font-bold text-[#0a0a0a]/30">Estimated Points</p>
  <p className="text-2xl font-mono font-bold text-[#1a4d3d]">
  {identityScore}
  </p>
  <p className="text-[10px] text-[#0a0a0a]/40 italic">Your total credits will be converted to quadratic votes.</p>
  </div>
  <button
    type="submit"
    className="bg-[#1a4d3d] text-white px-8 py-4 rounded-2xl font-bold hover:bg-[#0d3b2e] transition-all flex items-center gap-2 shadow-lg shadow-[#1a4d3d]/20"
  >
    Continue to Proposals
    <ChevronRight size={18} />
  </button>
  </div>
  </form>

<div className="bg-[#1a4d3d]/5 p-6 rounded-2xl border border-[#1a4d3d]/10 flex gap-4 items-start">
<Calculator className="text-[#1a4d3d] shrink-0 mt-1" size={20} />
<div className="space-y-1">
<p className="text-xs font-bold uppercase tracking-wider text-[#1a4d3d]">Point Calculation</p>
<p className="text-sm text-[#1a4d3d]/70 leading-relaxed">
Hosted ({WEIGHTS.hosted}x) + Attended ({WEIGHTS.attended}x) + Burns ({WEIGHTS.burns}x) + Referrals ({WEIGHTS.referrals}x). Your total points will be used as voting credits.
</p>
</div>
</div>
</motion.div>
)}
{view === 'list' && (
<motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 sm:space-y-8"
>
<div className="flex flex-col items-center justify-center space-y-2 py-4 sm:py-6">
  <div className="flex items-center gap-3 sm:gap-4">
    <div className="h-px w-8 sm:w-12 bg-[#0a0a0a]/10" />
    <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-1.5 sm:py-2 bg-white rounded-full border border-[#0a0a0a]/5 shadow-sm">
      <Calendar size={16} className="text-[#1a4d3d]" />
      <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-[#0a0a0a]">{formatTime(timeLeft)}</span>
    </div>
    <div className="h-px w-8 sm:w-12 bg-[#0a0a0a]/10" />
  </div>
  <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-[0.2em] sm:tracking-[0.3em] text-[#0a0a0a]/30">Simulation Time Remaining</p>
</div>
<div className="flex items-center justify-between gap-4">
<div className="space-y-1 sm:space-y-2">
<h2 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-[#0a0a0a]">Open Proposals</h2>
<p className="text-sm sm:text-base text-[#0a0a0a]/55">Select a proposal to participate in the collective decision-making process.</p>
</div>
</div>
<div className="grid gap-4">
{/* Rule Proposal Card */}
<div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-6 relative overflow-hidden">
  <div className="absolute top-0 left-0 bg-[#1a4d3d] text-white px-3 sm:px-4 py-1 rounded-br-2xl text-[9px] sm:text-[10px] font-bold uppercase tracking-widest z-10">
    Step 1
  </div>
<div className="flex items-center justify-between pt-2 gap-4">
<div className="space-y-1">
<h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40">Rule Proposal</h3>
<h4 className="text-lg sm:text-xl font-serif font-bold text-[#0a0a0a] leading-tight">Ban all fireworks in Forest City</h4>
</div>
<div className="p-2 sm:p-3 bg-red-50 rounded-2xl shrink-0">
<ShieldAlert className="text-red-500" size={20} sm:size={24} />
</div>
</div>
<div className="p-4 bg-red-50/50 rounded-2xl border border-red-100">
<p className="text-sm text-red-900/70 leading-relaxed">
This rule would prohibit the use of all consumer fireworks within Forest City limits to protect local wildlife and reduce noise pollution.
</p>
</div>
<div className="space-y-4">
<button
                      onClick={() => {
const nextVetoed = !vetoed;
                        setVetoed(nextVetoed);
// Auto-submit veto change
if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                          socketRef.current.send(JSON.stringify({
type: 'VOTE',
                            data: { 
                              userId,
                              allocations, 
                              weight: identityScore,
                              vetoed: nextVetoed
}
}));
}
}}
                      className={cn(
"w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2",
                        vetoed 
? "bg-red-500 text-white shadow-lg shadow-red-500/20" 
: "bg-white border-2 border-red-500 text-red-500 hover:bg-red-50"
)}
>
{vetoed ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
{vetoed ? "Proposal Vetoed" : "Veto Proposal - I like the fireworks!"}
</button>
<p className="text-[10px] text-center text-[#0a0a0a]/40 italic">
If you support this motion, no action required.
</p>
</div>
</div>
{PROPOSALS.map((proposal) => (
<div key={proposal.id} className="space-y-2">
<button
                      onClick={() => handleProposalSelect(proposal)}
                      className="group w-full text-left bg-[#1a3a14] p-6 sm:p-8 rounded-3xl border border-white/10 hover:border-white/30 transition-all shadow-2xl shadow-[#1a3a14]/20 flex items-center justify-between relative overflow-hidden"
>
<div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
<div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 blur-3xl rounded-full pointer-events-none" />
<div className="absolute top-0 left-0 bg-emerald-400 text-[#1a3a14] px-3 sm:px-4 py-1 rounded-br-2xl text-[9px] sm:text-[10px] font-bold uppercase tracking-widest z-10">
  Step 2
</div>
<div className="space-y-3 relative z-10 pt-2 pr-4">
<div className="flex items-center gap-2">
<span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-bold uppercase tracking-widest text-white/60">Active Budget Allocation</span>
<div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
</div>
<h3 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight leading-tight">{proposal.title}</h3>
<p className="text-white/60 text-xs sm:text-sm max-w-md line-clamp-2 sm:line-clamp-none">{proposal.description}</p>
<p className="text-emerald-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest pt-1 sm:pt-2">Cast your vote</p>
</div>
<div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform relative z-10 shrink-0">
<ChevronRight className="text-white" size={20} sm:size={24} />
</div>
</button>
</div>
))}
</div>
{/* Open Proposal Overview Preview */}
<div className="bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-[#0a0a0a]/5 space-y-6">
<div className="flex items-center justify-between">
<div className="space-y-1">
<h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#0a0a0a]/40">Open Proposal Overview</h3>
<p className="text-[10px] text-[#1a4d3d] font-mono font-bold uppercase">Proposed Budget per Proposal</p>
</div>
<Users size={16} className="text-[#0a0a0a]/20" />
</div>
<div className="space-y-4">
{PROPOSALS[0].options.map((option) => {
const result = qfResults[option.id] || { allocation: 0, totalVotes: 0 };
const target = TARGET_BUDGETS[option.id];
const progress = Math.min((result.allocation / target) * 100, 100);
return (
<div key={option.id} className="space-y-2">
<div className="flex justify-between items-center text-[10px]">
<span className="font-semibold text-[#0a0a0a]/60 uppercase tracking-wider">{option.name}</span>
<span className="font-mono text-[#1a4d3d] font-bold">${target.toLocaleString()}</span>
</div>
</div>
);
})}
</div>
</div>
</motion.div>
)}
{view === 'vote' && selectedProposal && (
<motion.div
              key="vote"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 sm:space-y-8"
>
<button 
                onClick={() => setView('list')}
                className="flex items-center gap-2 text-xs sm:text-sm font-medium text-[#0a0a0a]/55 hover:text-[#0a0a0a] transition-colors"
>
<ArrowLeft size={14} sm:size={16} /> Back to proposals
</button>
<div className="space-y-3 sm:space-y-4">
<h2 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[#0a0a0a] leading-tight">{selectedProposal.title}</h2>
<div className="bg-[#1a4d3d]/10 p-4 rounded-xl flex items-start gap-3 border border-[#1a4d3d]/20">
<Info size={18} sm:size={20} className="text-[#1a4d3d] shrink-0 mt-0.5" />
<p className="text-xs sm:text-sm text-[#1a4d3d]/75 leading-relaxed">
Quadratic voting allows you to express the intensity of your preference. 
The cost of votes increases quadratically: 1=1, 2=4, 3=9, 4=16, 5=25, 6=36, 7=49.
</p>
</div>
</div>
{/* Credit Bar */}
<div className="sticky top-16 sm:top-20 z-10 bg-white p-4 sm:p-6 rounded-2xl border border-[#0a0a0a]/10 shadow-lg space-y-3 sm:space-y-4">
<div className="flex justify-between items-end">
<div className="space-y-0.5 sm:space-y-1">
<p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Remaining Credits</p>
<p className={cn("text-2xl sm:text-3xl font-mono font-bold", remainingCredits < 0 ? "text-red-500" : "text-[#1a4d3d]")}>
{remainingCredits}
</p>
</div>
<div className="text-right space-y-0.5 sm:space-y-1">
<p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Total Used</p>
<p className="text-xl sm:text-2xl font-mono font-bold text-[#0a0a0a]/60">{totalCreditsUsed}</p>
</div>
</div>
<div className="h-2 bg-[#0a0a0a]/5 rounded-full overflow-hidden">
<motion.div 
                  className={cn("h-full transition-colors", remainingCredits < 0 ? "bg-red-500" : "bg-[#1a4d3d]")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((totalCreditsUsed / identityScore) * 100, 100)}%` }}
                />
</div>
</div>
{/* Options */}
<div className="space-y-4">
{selectedProposal.options.map((option) => {
const votes = allocations[option.id] || 0;
const cost = votes * votes;
const nextCost = (votes + 1) * (votes + 1);
const canAdd = remainingCredits >= (nextCost - cost);
return (
<div 
                      key={option.id}
                      className={cn(
"bg-white p-6 rounded-2xl border transition-all flex items-center justify-between",
                        votes > 0 ? "border-[#1a4d3d] shadow-md shadow-[#1a4d3d]/5" : "border-[#0a0a0a]/10"
)}
>
<div className="space-y-1">
<h4 className="text-lg font-semibold text-[#0a0a0a]">{option.name}</h4>
<div className="flex items-center gap-3">
<span className="text-xs font-mono bg-[#0a0a0a]/5 px-2 py-1 rounded text-[#0a0a0a]/60">
{votes} {votes === 1 ? 'vote' : 'votes'}
</span>
{votes > 0 && (
<span className="text-xs font-mono text-[#1a4d3d] font-bold">
Cost: {cost} credits
</span>
)}
</div>
</div>
<div className="flex items-center gap-4">
<button
                          onClick={() => handleVoteChange(option.id, -1)}
                          disabled={votes === 0}
                          className="w-10 h-10 rounded-full border border-[#0a0a0a]/10 flex items-center justify-center hover:bg-[#0a0a0a]/5 disabled:opacity-20 transition-all text-[#0a0a0a]"
>
<Minus size={18} />
</button>
<button
                          onClick={() => handleVoteChange(option.id, 1)}
                          disabled={!canAdd}
                          className={cn(
"w-10 h-10 rounded-full flex items-center justify-center transition-all",
                            canAdd 
? "bg-[#1a4d3d] text-white hover:scale-110 shadow-lg shadow-[#1a4d3d]/20" 
: "bg-[#0a0a0a]/5 text-[#0a0a0a]/20 cursor-not-allowed"
)}
>
<Plus size={18} />
</button>
</div>
</div>
);
})}
</div>
<button
                onClick={handleSubmit}
                className="w-full py-4 bg-[#0a0a0a] text-white rounded-2xl font-bold text-lg hover:bg-[#0a0a0a]/90 transition-all shadow-xl shadow-[#0a0a0a]/20"
>
Submit My Votes
</button>
</motion.div>
)}
{view === 'success' && (
<motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-8 py-12"
>
<div className="flex justify-center">
<div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-2xl shadow-emerald-500/20">
<CheckCircle2 size={48} />
</div>
</div>
<div className="space-y-2">
<h2 className="text-4xl font-serif font-bold tracking-tight text-[#0a0a0a]">Votes Recorded!</h2>
<p className="text-[#0a0a0a]/55 max-w-sm mx-auto">
Your preferences have been successfully submitted to the quadratic voting pool.
</p>
</div>
<div className="grid gap-8 max-w-2xl mx-auto w-full">
{/* Personal Summary */}
<div className="bg-white p-8 rounded-3xl border border-[#0a0a0a]/10 space-y-8 text-left shadow-sm">
<div className="flex items-center justify-between">
<h3 className="text-sm uppercase tracking-[0.2em] font-bold text-[#0a0a0a]/40">Your Allocation</h3>
<div className="px-3 py-1 bg-[#1a4d3d]/5 rounded-full">
<p className="text-[10px] text-[#1a4d3d] font-mono font-bold uppercase">Personal Ballot</p>
</div>
</div>
<div className="space-y-0">
<div className="grid grid-cols-[1fr_120px_120px] gap-4 pb-4 border-b border-[#0a0a0a]/10 text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">
<span>Proposal</span>
<span className="text-center">Votes Submitted</span>
<span className="text-right">Credits Used</span>
</div>
<div className="divide-y divide-[#0a0a0a]/5">
{Object.entries(allocations).map(([id, votes]) => {
if (votes === 0) return null;
const option = selectedProposal?.options.find(o => o.id === id);
return (
<div key={id} className="grid grid-cols-[1fr_120px_120px] gap-4 items-center py-5 transition-colors hover:bg-[#0a0a0a]/[0.02] -mx-8 px-8">
<span className="font-semibold text-[#0a0a0a] leading-tight pr-4">{option?.name}</span>
<div className="flex justify-center">
<div className="flex flex-col items-center">
<span className="text-sm font-mono text-[#1a4d3d] font-bold">
{votes}
</span>
<span className="text-[8px] text-[#0a0a0a]/20 uppercase tracking-tighter font-bold">Units</span>
</div>
</div>
<div className="flex justify-end">
<div className="flex flex-col items-end">
<span className="text-sm font-mono font-bold text-[#0a0a0a]/80">
{(votes as number) * (votes as number)}
</span>
<span className="text-[8px] text-[#0a0a0a]/20 uppercase tracking-tighter font-bold">Credits</span>
</div>
</div>
</div>
);
})}
{remainingCredits > 0 && (
<div className="grid grid-cols-[1fr_120px_120px] gap-4 items-center py-5 transition-colors hover:bg-[#0a0a0a]/[0.02] -mx-8 px-8 italic">
<span className="font-semibold text-[#0a0a0a]/40 leading-tight pr-4">Rollover Credits</span>
<div className="flex justify-center">
<div className="flex flex-col items-center">
<span className="text-sm font-mono text-[#0a0a0a]/20 font-bold">
-
</span>
</div>
</div>
<div className="flex justify-end">
<div className="flex flex-col items-end">
<span className="text-sm font-mono font-bold text-[#0a0a0a]/40">
{remainingCredits}
</span>
<span className="text-[8px] text-[#0a0a0a]/20 uppercase tracking-tighter font-bold">Credits</span>
</div>
</div>
</div>
)}
</div>
</div>
</div>
{/* Guild Summary */}
<div className="bg-[#1a1a14] p-8 rounded-3xl text-white space-y-8 text-left border border-white/5 shadow-2xl relative overflow-hidden">
<div className="absolute top-0 right-0 w-32 h-32 bg-[#1a4d3d]/10 blur-3xl -mr-16 -mt-16 rounded-full" />
<div className="flex items-center justify-between relative z-10">
<div className="space-y-1">
<h3 className="text-sm uppercase tracking-widest font-bold text-white/40">NS Allocation</h3>
<div className="flex items-center gap-1.5">
<div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
<p className="text-[10px] text-white/20 font-mono uppercase tracking-tighter">Quadratic Funding Pool: ${QF_POOL.toLocaleString()}</p>
</div>
</div>
<div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
<TrendingUp size={18} className="text-[#1a4d3d]" />
</div>
</div>
<div className="space-y-6 relative z-10">
{selectedProposal?.options.map((option) => {
const result = qfResults[option.id] || { allocation: 0, multiplier: 0, totalVotes: 0 };
const target = TARGET_BUDGETS[option.id];
const progress = Math.min((result.allocation / target) * 100, 100);
let statusColor = "bg-red-500";
let statusText = "Underfunded";
if (result.allocation >= target) {
                        statusColor = "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]";
                        statusText = "Fully Funded";
} else if (result.allocation >= target * 0.5) {
                        statusColor = "bg-yellow-500";
                        statusText = "Soft Consensus";
}
return (
<div key={option.id} className="space-y-2">
<div className="flex justify-between items-end">
<div className="space-y-0.5">
<span className="font-medium text-white/90 text-sm">{option.name}</span>
<div className="flex items-center gap-2">
<span className={cn("text-[8px] uppercase font-bold px-1.5 py-0.5 rounded", statusColor, "text-white")}>
{statusText}
</span>
</div>
</div>
<div className="text-right flex flex-col items-end">
<span className="font-mono text-[#1a4d3d] font-bold text-sm leading-none">${Math.floor(result.allocation).toLocaleString()}</span>
<span className="text-[9px] text-white/30 uppercase font-bold tracking-tighter mt-0.5">Target: ${target.toLocaleString()}</span>
</div>
</div>
<div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
<motion.div 
                              className={cn("h-full", statusColor)}
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                            />
</div>
</div>
);
})}
</div>
</div>
</div>
<button
                onClick={() => setView('list')}
                className="px-8 py-3 border border-[#0a0a0a]/10 rounded-full font-medium hover:bg-[#0a0a0a]/5 transition-all text-[#0a0a0a]"
>
Back to Home
</button>
</motion.div>
)}
{view === 'overview' && (
<motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 sm:space-y-8"
>
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
<div className="space-y-1 sm:space-y-2">
<h2 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-[#0a0a0a]">Global Overview</h2>
<p className="text-sm sm:text-base text-[#0a0a0a]/55">Real-time collective results from all participants. Funding is allocated linearly based on vote share, then re-balanced via waterfall when closed.</p>
</div>
<div className="flex flex-wrap gap-2">
{globalState.isClosed && (
  <div className="bg-emerald-500 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20">
    <ShieldCheck size={14} />
    <span className="font-mono font-bold text-[10px] sm:text-xs uppercase tracking-widest">Budget Finalized</span>
  </div>
)}
{!globalState.isClosed && (
<button 
                  onClick={() => {
                    const randomVotes = () => {
                      const newAllocations: Record<string, number> = {};
                      PROPOSALS[0].options.forEach(opt => {
                        newAllocations[opt.id] = Math.floor(Math.random() * 5) + 1;
                      });
                      const weight = Math.floor(Math.random() * 100) + 50;
                      const userId = `sim-${Math.random().toString(36).substr(2, 9)}`;
                      socketRef.current?.send(JSON.stringify({
                        type: 'VOTE',
                        data: { userId, allocations: newAllocations, weight, vetoed: Math.random() > 0.8 }
                      }));
                    };
                    for(let i=0; i<25; i++) setTimeout(randomVotes, i * 200);
                  }}
                  className="bg-[#1a4d3d]/10 text-[#1a4d3d] px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-widest hover:bg-[#1a4d3d]/20 transition-all flex items-center gap-2"
>
<Zap size={14} />
Simulate Crowd
</button>
)}
<div className="bg-[#1a4d3d] text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl flex items-center gap-2">
<Users size={14} sm:size={16} />
<span className="font-mono font-bold text-[10px] sm:text-sm">{Object.keys(globalState.participants).length} Participants</span>
</div>
</div>
</div>
{/* Stats Grid */}
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
<div className="bg-white p-6 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-2 relative overflow-hidden">
  <div className="absolute top-4 right-4">
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-500/60">Live</span>
    </div>
  </div>
<p className="text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Participants</p>
<div className="flex items-center gap-2">
<Users size={16} className="text-[#1a4d3d]" />
<p className="text-2xl font-mono font-bold text-[#0a0a0a]">{Object.keys(globalState.participants).length}</p>
</div>
</div>
<div className="bg-white p-6 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-2">
<p className="text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Total Votes</p>
<div className="flex items-center gap-2">
<Vote size={16} className="text-[#1a4d3d]" />
<p className="text-2xl font-mono font-bold text-[#0a0a0a]">
{(Object.values(globalState.proposals).flat() as Contribution[]).reduce((sum: number, c) => sum + c.votes, 0)}
</p>
</div>
</div>
<div className="bg-white p-6 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-2">
<p className="text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Total Weight</p>
<div className="flex items-center gap-2">
<Zap size={16} className="text-[#1a4d3d]" />
<p className="text-2xl font-mono font-bold text-[#0a0a0a]">
{(Object.values(globalState.participants) as number[]).reduce((sum: number, w) => sum + w, 0)}
</p>
</div>
</div>
</div>
{/* Veto Status */}
<div className={cn(
"p-8 rounded-3xl border flex items-center justify-between",
                vetoStats.isVetoed ? "bg-red-500 text-white border-red-600" : "bg-white border-[#0a0a0a]/10"
)}>
<div className="space-y-1">
<h3 className={cn("text-xs font-bold uppercase tracking-widest", vetoStats.isVetoed ? "text-white/60" : "text-[#0a0a0a]/40")}>
Rule Proposal Status
</h3>
<p className="text-xl font-serif font-bold">
{vetoStats.isVetoed ? "Rule has been vetoed" : "Achieved Rough Consensus"}
</p>
<div className="mt-2 p-3 bg-black/5 rounded-xl">
  <p className={cn("text-xs font-medium", vetoStats.isVetoed ? "text-white/80" : "text-[#0a0a0a]/70")}>
    Rule: Ban all fireworks in Forest City. This rule would prohibit the use of all consumer fireworks within Forest City limits to protect local wildlife and reduce noise pollution.
  </p>
</div>
<div className="flex items-center gap-2 pt-4">
<div className="h-1.5 w-32 bg-black/10 rounded-full overflow-hidden">
<div 
                        className={cn("h-full", vetoStats.isVetoed ? "bg-white" : "bg-red-500")} 
                        style={{ width: `${Math.min(vetoStats.percentage, 100)}%` }}
                      />
</div>
<span className="text-[10px] font-mono font-bold">{vetoStats.percentage.toFixed(1)}% Vetoed</span>
<span className="text-[10px] uppercase font-bold tracking-tighter opacity-40">(Threshold: 20%)</span>
</div>
</div>
<ShieldAlert size={32} className={vetoStats.isVetoed ? "text-white" : "text-red-500"} />
</div>
{/* Leaderboard */}
<div className="space-y-4">
<h3 className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40">Funding Leaderboard</h3>
{Object.values(globalState.proposals).flat().length === 0 ? (
  <div className="bg-white p-12 rounded-3xl border border-dashed border-[#0a0a0a]/20 text-center space-y-3">
    <div className="w-12 h-12 bg-[#0a0a0a]/5 rounded-full flex items-center justify-center mx-auto">
      <Vote size={20} className="text-[#0a0a0a]/20" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-bold text-[#0a0a0a]/60">No votes cast yet</p>
      <p className="text-xs text-[#0a0a0a]/40">Participate in a proposal to see the collective results populate here.</p>
    </div>
  </div>
) : (
<div className="grid gap-4">
{PROPOSALS[0].options.map((option) => {
const result = qfResults[option.id] || { allocation: 0, totalVotes: 0 };
const target = TARGET_BUDGETS[option.id];
const progress = (result.allocation / target) * 100;
const totalVotesAcrossAll = Object.values(qfResults).reduce((sum: number, r: any) => sum + (r.totalVotes || 0), 0) as number;
const voteShare = totalVotesAcrossAll > 0 ? (result.totalVotes / totalVotesAcrossAll) * 100 : 0;
let statusColor = "bg-red-500";
let statusGlow = "";
if (result.allocation >= target) {
                      statusColor = "bg-emerald-500";
                      statusGlow = "shadow-[0_0_20px_rgba(16,185,129,0.3)]";
} else if (result.allocation >= target * 0.5) {
                      statusColor = "bg-yellow-500";
}
return (
<div key={option.id} className={cn("bg-white p-6 sm:p-8 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-6", statusGlow)}>
<div className="flex flex-col sm:flex-row justify-between items-start gap-4">
<div className="space-y-1">
<h4 className="text-lg sm:text-xl font-serif font-bold text-[#0a0a0a] leading-tight">{option.name}</h4>
<div className="flex flex-wrap items-center gap-3">
<div className="flex items-center gap-1 text-[10px] font-bold text-[#0a0a0a]/40 uppercase tracking-widest">
<Users size={12} />
{globalState.proposals[option.id]?.length || 0} Contributors
</div>
<div className="flex items-center gap-1 text-[10px] font-bold text-[#0a0a0a]/40 uppercase tracking-widest">
<Vote size={12} />
{result.totalVotes} Total Votes
</div>
</div>
</div>
<div className="sm:text-right w-full sm:w-auto">
<p className="text-xl sm:text-2xl font-mono font-bold text-[#1a4d3d]">${Math.floor(result.allocation).toLocaleString()}</p>
<p className="text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Allocated of ${target.toLocaleString()}</p>
</div>
</div>
<div className="space-y-2">
<div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
<span className="text-[#0a0a0a]/40">Funding Progress</span>
<span className="text-[#1a4d3d]">{progress.toFixed(1)}%</span>
</div>
<div className="h-3 bg-[#0a0a0a]/5 rounded-full overflow-hidden p-0.5 border border-[#0a0a0a]/5 relative">
<motion.div 
                              className={cn("h-full rounded-full absolute left-0.5 top-0.5", statusColor)}
                              initial={{ width: 0 }}
                              animate={{ width: `calc(${Math.min(progress, 100)}% - 4px)` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                            />
{progress > 100 && (
  <motion.div 
    className="h-full rounded-full absolute left-0.5 top-0.5 bg-[#064e3b]"
    initial={{ width: 0 }}
    animate={{ width: `calc(${Math.min(progress - 100, 100)}% - 4px)` }}
    transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
  />
)}
</div>
</div>
<div className="grid grid-cols-1 gap-4 pt-2">
<div className="bg-[#faf8f5] p-4 rounded-2xl space-y-1">
<p className="text-[9px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Weight Share</p>
<p className="text-lg font-mono font-bold text-[#1a4d3d]">{voteShare.toFixed(1)}%</p>
</div>
</div>
</div>
);
})}
</div>
)}
</div>
<div className="flex flex-col gap-3">
  {!globalState.isClosed && (
    <div className="space-y-3">
      <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-2xl flex items-start gap-3">
        <Info size={16} className="text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-700 leading-relaxed">
          Closing the budget will trigger the <strong>Waterfall Re-balancing</strong>. Funds will be distributed to projects in order of popularity until their target budgets are met.
        </p>
      </div>
      <button
        onClick={() => {
          const password = prompt("Enter password to close budget (Hint: Rome):");
          if (password === "Rome") {
            console.log("Sending CLOSE_BUDGET message...");
            socketRef.current?.send(JSON.stringify({ type: 'CLOSE_BUDGET', password }));
          } else if (password !== null) {
            alert("Incorrect password.");
          }
        }}
        className="w-full py-4 bg-[#1a4d3d] text-white rounded-2xl font-bold hover:bg-[#1a4d3d]/90 transition-all shadow-lg shadow-[#1a4d3d]/20 flex items-center justify-center gap-2"
      >
        <ShieldCheck size={20} />
        Close Budget & Re-balance
      </button>
    </div>
  )}
  {globalState.isClosed && (
    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700">
      <CheckCircle2 size={18} className="shrink-0" />
      <p className="text-sm font-medium">Budget is closed. Waterfall re-balancing applied.</p>
    </div>
  )}
  <button
                  onClick={() => setView('list')}
                  className="w-full py-4 border border-[#0a0a0a]/10 rounded-2xl font-bold hover:bg-[#0a0a0a]/5 transition-all text-[#0a0a0a]"
  >
  Return to Proposals
  </button>
  <button
    onClick={() => {
      if (confirm("Are you sure you want to reset all votes and the budget?")) {
        socketRef.current?.send(JSON.stringify({ type: 'RESET' }));
      }
    }}
    className="w-full py-2 text-[10px] uppercase font-bold tracking-widest text-red-500/50 hover:text-red-500 transition-all"
  >
    Reset Simulation
  </button>
</div>
</motion.div>
)}
{view === 'qr' && (
<motion.div
              key="qr"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8 py-8"
>
<div className="space-y-2">
<h2 className="text-3xl font-serif font-bold tracking-tight text-[#0a0a0a]">Share this App</h2>
<p className="text-[#0a0a0a]/55">Scan the QR code to participate in the voting process.</p>
</div>
<div className="bg-white p-8 rounded-3xl border border-[#0a0a0a]/10 inline-block shadow-2xl">
<QRCodeSVG 
                  value={appUrl} 
                  size={256}
                  level="H"
                  includeMargin={true}
                  className="mx-auto"
                />
<div className="mt-6 p-3 bg-[#0a0a0a]/5 rounded-xl break-all text-xs font-mono text-[#0a0a0a]/55">
{appUrl}
</div>
</div>
<div className="flex flex-col gap-4 max-w-xs mx-auto">
<button
                  onClick={() => {
                    navigator.clipboard.writeText(appUrl);
}}
                  className="w-full py-3 bg-[#0a0a0a] text-white rounded-xl font-medium hover:bg-[#0a0a0a]/90 transition-all"
>
Copy Link
</button>
<button
                  onClick={() => setView('list')}
                  className="w-full py-3 border border-[#0a0a0a]/10 rounded-xl font-medium hover:bg-[#0a0a0a]/5 transition-all text-[#0a0a0a]"
>
Close
</button>
</div>
</motion.div>
)}
</AnimatePresence>
</main>
{/* Footer */}
<footer className="max-w-2xl mx-auto px-6 py-12 border-t border-[#0a0a0a]/5 text-center space-y-4">
<div className="flex justify-center gap-6">
<div className="flex items-center gap-2 text-xs font-bold text-[#0a0a0a]/40 uppercase tracking-widest">
<Trophy size={14} />
Fair Governance
</div>
<div className="flex items-center gap-2 text-xs font-bold text-[#0a0a0a]/40 uppercase tracking-widest">
<Vote size={14} />
Quadratic Voting
</div>
</div>
<p className="text-xs text-[#0a0a0a]/30">
© 2026 Randall Baran-Chong • Built for The Network School
</p>
</footer>
</div>
);
}
