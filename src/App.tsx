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
LayoutDashboard,
ShieldAlert,
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
{ id: 'cafe', name: 'Free NS cafe' },
{ id: 'snack-bar', name: '24/7 free snack bar' },
{ id: 'scooters', name: 'Free scooters to use in Forest City' },
{ id: 'dance', name: 'Hiring a full-time dance instructor' },
{ id: 'claude', name: 'A free Claude pro subscription' },
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
}
export default function App() {
const [view, setView] = useState<'identity' | 'list' | 'vote' | 'success' | 'qr' | 'overview'>('identity');
const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
const [allocations, setAllocations] = useState<VoteAllocation>({});
const [appUrl, setAppUrl] = useState('');
const [globalState, setGlobalState] = useState<GlobalState>({
    proposals: {},
    vetoes: [],
    participants: {}
});
const [identityInputs, setIdentityInputs] = useState<Record<string, string>>({
    hosted: '',
    attended: '',
    burns: '',
    referrals: ''
});
const [identityScore, setIdentityScore] = useState(10);
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
const socketRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    setAppUrl(window.location.href);
// Setup WebSocket
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;
    socket.onmessage = (event) => {
try {
const payload = JSON.parse(event.data);
if (payload.type === 'SYNC') {
          setGlobalState(payload.data);
}
} catch (err) {
        console.error('Error parsing socket message:', err);
}
};
return () => {
if (socketRef.current) {
        socketRef.current.close();
}
};
}, []);
const totalCreditsUsed = useMemo(() => {
return Object.values(allocations).reduce((sum: number, votes: number) => sum + (votes * votes), 0);
}, [allocations]);
const remainingCredits = identityScore - totalCreditsUsed;
const qfResults = useMemo(() => {
const results: Record<string, { score: number, allocation: number, multiplier: number, totalVotes: number }> = {};
let totalRepublicScore = 0;
Object.keys(TARGET_BUDGETS).forEach(id => {
const contributions = globalState.proposals[id] || [];
const totalVotes = contributions.reduce((sum: number, c) => sum + c.votes, 0);
const score = Math.pow(contributions.reduce((sum: number, c) => sum + Math.sqrt(c.votes), 0), 2);
      results[id] = { score, allocation: 0, multiplier: 0, totalVotes };
      totalRepublicScore += score;
});
if (totalRepublicScore > 0) {
Object.keys(results).forEach(id => {
const res = results[id];
        res.allocation = (res.score / totalRepublicScore) * QF_POOL;
        res.multiplier = res.totalVotes > 0 ? res.allocation / res.totalVotes : 0;
});
}
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
const score = (hosted * 3) + 
(attended * 0.5) + 
(burns * 1.25) + 
(referrals * 5);
    setIdentityScore(Math.floor(score));
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
    setAllocations({});
    setView('vote');
};
const handleSubmit = () => {
if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
type: 'VOTE',
        data: { 
          userId,
          allocations, 
          weight: identityScore,
          vetoed
}
}));
}
    setView('success');
};
return (
<div className="min-h-screen bg-[#faf8f5] text-[#0a0a0a] font-sans selection:bg-[#1a4d3d] selection:text-white" style={{backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(26, 77, 61, 0.03) 0%, transparent 50%)'}}>
{/* Header */}
<header className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-md border-b border-[#0a0a0a]/8 px-6 py-4 flex justify-between items-center shadow-sm">
<div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('identity')}>
<div className="w-8 h-8 bg-[#0a0a0a] rounded-lg flex items-center justify-center">
<Vote className="text-white" size={18} />
</div>
<h1 className="font-serif font-bold text-xl tracking-tight text-[#0a0a0a]">The Quadratic Simulation</h1>
</div>
<div className="flex items-center gap-4">
<button 
            onClick={() => setView('overview')}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#0a0a0a]/5 hover:bg-[#0a0a0a]/10 transition-all text-xs font-bold uppercase tracking-widest text-[#1a4d3d]"
>
<LayoutDashboard size={14} />
Overview
</button>
<button 
            onClick={() => setView('qr')}
            className="w-10 h-10 rounded-full border border-[#0a0a0a]/10 flex items-center justify-center hover:bg-[#0a0a0a]/5 transition-all text-[#1a4d3d]"
>
<QrCode size={20} />
</button>
</div>
</header>
<main className="max-w-2xl mx-auto px-6 py-12">
<AnimatePresence mode="wait">
{view === 'identity' && (
<motion.div
              key="identity"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
>
<div className="space-y-2 text-center">
<h2 className="text-4xl font-serif font-bold tracking-tight text-[#0a0a0a]">Proof of Work - March Score</h2>
<p className="text-[#0a0a0a]/55">Calculate your identity points based on your contributions this month. Your total credits will be converted to quadratic votes.</p>
</div>
<form onSubmit={handleIdentitySubmit} className="bg-white p-8 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-6">
<div className="grid gap-6 sm:grid-cols-2">
<div className="space-y-2">
<label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
<Presentation size={14} />
Events Hosted
</label>
<input
type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      value={identityInputs.hosted}
                      onChange={(e) => setIdentityInputs(prev => ({ ...prev, hosted: e.target.value }))}
                      className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono"
                    />
</div>
<div className="space-y-2">
<label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
<Calendar size={14} />
Events Attended
</label>
<input
type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      value={identityInputs.attended}
                      onChange={(e) => setIdentityInputs(prev => ({ ...prev, attended: e.target.value }))}
                      className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono"
                    />
</div>
<div className="space-y-2">
<label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
<Flame size={14} />
Burns
</label>
<input
type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      value={identityInputs.burns}
                      onChange={(e) => setIdentityInputs(prev => ({ ...prev, burns: e.target.value }))}
                      className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono"
                    />
</div>
<div className="space-y-2">
<label className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40 flex items-center gap-2">
<UserPlus size={14} />
Referrals
</label>
<input
type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      value={identityInputs.referrals}
                      onChange={(e) => setIdentityInputs(prev => ({ ...prev, referrals: e.target.value }))}
                      className="w-full bg-[#faf8f5] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1a4d3d] transition-all font-mono"
                    />
</div>
</div>
<div className="pt-4 border-t border-[#0a0a0a]/5 flex items-center justify-between">
<div className="space-y-1">
<p className="text-[10px] uppercase tracking-widest font-bold text-[#0a0a0a]/30">Estimated Points</p>
<p className="text-2xl font-mono font-bold text-[#1a4d3d]">
{Math.floor(
(Number(identityInputs.hosted) || 0) * 3 + 
(Number(identityInputs.attended) || 0) * 0.5 + 
(Number(identityInputs.burns) || 0) * 1.25 + 
(Number(identityInputs.referrals) || 0) * 5
)}
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
Hosted (3x) + Attended (0.5x) + Burns (1.25x) + Referrals (5x). Your total points will be used as voting credits.
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
              className="space-y-8"
>
<div className="flex flex-col items-center justify-center space-y-4 py-4">
<div className="bg-[#0a0a0a] text-white px-6 py-3 rounded-2xl font-mono text-3xl font-bold shadow-xl border border-white/10 flex items-center gap-3">
<Calendar size={24} className="text-white/40" />
{formatTime(timeLeft)}
</div>
<p className="text-[10px] uppercase font-bold tracking-[0.3em] text-[#0a0a0a]/30">Time Remaining in Simulation</p>
</div>
<div className="flex items-center justify-between">
<div className="space-y-2">
<h2 className="text-4xl font-serif font-bold tracking-tight text-[#0a0a0a]">Open Proposals</h2>
<p className="text-[#0a0a0a]/55">Select a proposal to participate in the collective decision-making process.</p>
</div>
<button 
                  onClick={() => setView('identity')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1a4d3d] hover:text-[#0d3b2e] transition-colors"
>
<ArrowLeft size={14} />
Change Score
</button>
</div>
<div className="grid gap-4">
{/* Rule Proposal Card */}
<div className="bg-white p-8 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-6">
<div className="flex items-center justify-between">
<div className="space-y-1">
<h3 className="text-xs font-bold uppercase tracking-widest text-[#0a0a0a]/40">Rule Proposal</h3>
<h4 className="text-xl font-serif font-bold text-[#0a0a0a]">Ban all fireworks in Forest City</h4>
</div>
<div className="p-3 bg-red-50 rounded-2xl">
<ShieldAlert className="text-red-500" size={24} />
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
{vetoed ? "Proposal Vetoed" : "Veto Proposal"}
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
                      className="group w-full text-left bg-[#1a3a14] p-8 rounded-3xl border border-white/10 hover:border-white/30 transition-all shadow-2xl shadow-[#1a3a14]/20 flex items-center justify-between relative overflow-hidden"
>
<div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
<div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 blur-3xl rounded-full pointer-events-none" />
<div className="space-y-3 relative z-10">
<div className="flex items-center gap-2">
<span className="px-2 py-1 bg-white/10 rounded text-[10px] font-bold uppercase tracking-widest text-white/60">Active Budget Allocation</span>
<div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
</div>
<h3 className="text-2xl font-serif font-bold text-white tracking-tight">{proposal.title}</h3>
<p className="text-white/60 text-sm max-w-md">{proposal.description}</p>
<p className="text-emerald-400 font-bold text-xs uppercase tracking-widest pt-2">Cast your vote</p>
</div>
<div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform relative z-10">
<ChevronRight className="text-white" size={24} />
</div>
</button>
</div>
))}
</div>
{/* Guild Standings Preview */}
<div className="bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-[#0a0a0a]/5 space-y-6">
<div className="flex items-center justify-between">
<div className="space-y-1">
<h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#0a0a0a]/40">Guild Standings</h3>
<p className="text-[10px] text-[#1a4d3d] font-mono font-bold uppercase">Current Quadratic Allocation</p>
</div>
<Users size={16} className="text-[#0a0a0a]/20" />
</div>
<div className="space-y-4">
{PROPOSALS[0].options.map((option) => {
const result = qfResults[option.id] || { allocation: 0, multiplier: 0, totalVotes: 0 };
const target = TARGET_BUDGETS[option.id];
const progress = Math.min((result.allocation / target) * 100, 100);
return (
<div key={option.id} className="space-y-2">
<div className="flex justify-between items-center text-[10px]">
<span className="font-semibold text-[#0a0a0a]/60 uppercase tracking-wider">{option.name}</span>
<span className="font-mono text-[#1a4d3d] font-bold">${Math.floor(result.allocation).toLocaleString()}</span>
</div>
<div className="h-1 bg-[#0a0a0a]/5 rounded-full overflow-hidden">
<motion.div 
                            className="h-full bg-[#1a4d3d]/40"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1.5, ease: "circOut" }}
                          />
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
              className="space-y-8"
>
<button 
                onClick={() => setView('list')}
                className="flex items-center gap-2 text-sm font-medium text-[#0a0a0a]/55 hover:text-[#0a0a0a] transition-colors"
>
<ArrowLeft size={16} /> Back to proposals
</button>
<div className="space-y-4">
<h2 className="text-3xl font-serif font-bold tracking-tight text-[#0a0a0a]">{selectedProposal.title}</h2>
<div className="bg-[#1a4d3d]/10 p-4 rounded-xl flex items-start gap-3 border border-[#1a4d3d]/20">
<Info size={20} className="text-[#1a4d3d] shrink-0 mt-0.5" />
<p className="text-sm text-[#1a4d3d]/75 leading-relaxed">
Quadratic voting allows you to express the intensity of your preference. 
The cost of votes increases quadratically: 1=1, 2=4, 3=9, 4=16, 5=25, 6=36, 7=49.
</p>
</div>
</div>
{/* Credit Bar */}
<div className="sticky top-20 z-10 bg-white p-6 rounded-2xl border border-[#0a0a0a]/10 shadow-lg space-y-4">
<div className="flex justify-between items-end">
<div className="space-y-1">
<span className="text-xs uppercase tracking-widest font-semibold text-[#0a0a0a]/40">Your Balance</span>
<div className="flex items-center gap-2 text-2xl font-mono font-bold text-[#0a0a0a]">
<Wallet className="text-[#1a4d3d]" />
{remainingCredits} <span className="text-sm font-normal text-[#0a0a0a]/40">/ {identityScore} credits</span>
</div>
</div>
<div className="text-right">
<span className="text-xs uppercase tracking-widest font-semibold text-[#0a0a0a]/40">Used</span>
<div className="text-xl font-mono font-bold text-[#1a4d3d]">
{totalCreditsUsed}
</div>
</div>
</div>
<div className="h-2 bg-[#0a0a0a]/5 rounded-full overflow-hidden">
<motion.div 
                    className="h-full bg-[#1a4d3d]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(totalCreditsUsed / identityScore) * 100}%` }}
                  />
</div>
{remainingCredits > 0 && (
<div className="flex items-center gap-2 text-xs font-semibold text-[#1a4d3d] bg-[#1a4d3d]/5 p-2 rounded-lg border border-[#1a4d3d]/10">
<Info size={14} />
You have {remainingCredits} credits remaining. These will be counted as rollover.
</div>
)}
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
<span className="text-[10px] text-white/40 font-mono">Match: {result.multiplier.toFixed(2)}x</span>
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
              className="space-y-8"
>
<div className="flex items-center justify-between">
<div className="space-y-2">
<h2 className="text-4xl font-serif font-bold tracking-tight text-[#0a0a0a]">Overview</h2>
<p className="text-[#0a0a0a]/55">Live dashboard of the collective decision-making process.</p>
</div>
<button 
                  onClick={() => setView('list')}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1a4d3d]"
>
<ArrowLeft size={14} />
Back
</button>
</div>
{/* Stats Grid */}
<div className="grid grid-cols-3 gap-4">
<div className="bg-white p-6 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-2">
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
<p className={cn("text-xs max-w-md", vetoStats.isVetoed ? "text-white/60" : "text-[#0a0a0a]/55")}>
Proposal: Ban all fireworks in Forest City. This rule would prohibit the use of all consumer fireworks within Forest City limits.
</p>
<div className="flex items-center gap-2 pt-2">
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
<div className="grid gap-4">
{PROPOSALS[0].options.map((option) => {
const result = qfResults[option.id] || { allocation: 0, multiplier: 0, totalVotes: 0 };
const target = TARGET_BUDGETS[option.id];
const progress = Math.min((result.allocation / target) * 100, 100);
const totalWeight = (Object.values(globalState.participants) as number[]).reduce((sum: number, w) => sum + w, 0);
const voteShare = totalWeight > 0 ? (result.totalVotes / totalWeight) * 100 : 0;
let statusColor = "bg-red-500";
let statusGlow = "";
if (result.allocation >= target) {
                      statusColor = "bg-emerald-500";
                      statusGlow = "shadow-[0_0_20px_rgba(16,185,129,0.3)]";
} else if (result.allocation >= target * 0.5) {
                      statusColor = "bg-yellow-500";
}
return (
<div key={option.id} className={cn("bg-white p-8 rounded-3xl border border-[#0a0a0a]/10 shadow-sm space-y-6", statusGlow)}>
<div className="flex justify-between items-start">
<div className="space-y-1">
<h4 className="text-xl font-serif font-bold text-[#0a0a0a]">{option.name}</h4>
<div className="flex items-center gap-3">
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
<div className="text-right">
<p className="text-2xl font-mono font-bold text-[#1a4d3d]">${Math.floor(result.allocation).toLocaleString()}</p>
<p className="text-[10px] uppercase font-bold tracking-widest text-[#0a0a0a]/30">Allocated of ${target.toLocaleString()}</p>
</div>
</div>
<div className="space-y-2">
<div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
<span className="text-[#0a0a0a]/40">Funding Progress</span>
<span className="text-[#1a4d3d]">{progress.toFixed(1)}%</span>
</div>
<div className="h-3 bg-[#0a0a0a]/5 rounded-full overflow-hidden p-0.5 border border-[#0a0a0a]/5">
<motion.div 
                              className={cn("h-full rounded-full", statusColor)}
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                            />
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
</div>
<button
                onClick={() => setView('list')}
                className="w-full py-4 border border-[#0a0a0a]/10 rounded-2xl font-bold hover:bg-[#0a0a0a]/5 transition-all text-[#0a0a0a]"
>
Return to Proposals
</button>
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
