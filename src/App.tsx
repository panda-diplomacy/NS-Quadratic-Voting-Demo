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
  AlertCircle
} from 'lucide-react';
import { cn } from './utils';
import { Proposal, VoteAllocation } from './types';

const INITIAL_CREDITS = 10;

const PROPOSALS: Proposal[] = [
  {
    id: 'ns-budget-2026',
    title: 'NS Discretionary Budget April 2026',
    description: 'Allocate your 10 identity points to decide how the discretionary budget should be spent this month.',
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

export default function App() {
  const [view, setView] = useState<'list' | 'vote' | 'success' | 'qr'>('list');
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [allocations, setAllocations] = useState<VoteAllocation>({});
  const [appUrl, setAppUrl] = useState('');
  const [globalVotes, setGlobalVotes] = useState<Record<string, number>>({});
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
          setGlobalVotes(payload.data);
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

  const remainingCredits = INITIAL_CREDITS - totalCreditsUsed;
  const isFullyAllocated = totalCreditsUsed === INITIAL_CREDITS;

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
        data: { allocations }
      }));
    }
    setView('success');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-[#5A5A40] selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-[#141414]/10 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('list')}>
          <div className="w-8 h-8 bg-[#5A5A40] rounded-lg flex items-center justify-center text-white">
            <Vote size={20} />
          </div>
          <h1 className="text-xl font-serif italic font-semibold tracking-tight">Quadratic.Vote</h1>
        </div>
        <button 
          onClick={() => setView('qr')}
          className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
          title="Share QR Code"
        >
          <QrCode size={20} />
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-4xl font-serif font-bold tracking-tight">Open Proposals</h2>
                <p className="text-[#141414]/60">Select a proposal to participate in the collective decision-making process.</p>
              </div>

              <div className="grid gap-4">
                {PROPOSALS.map((proposal) => (
                  <button
                    key={proposal.id}
                    onClick={() => handleProposalSelect(proposal)}
                    className="group w-full text-left bg-white p-6 rounded-2xl border border-[#141414]/10 hover:border-[#5A5A40] transition-all hover:shadow-xl hover:shadow-[#5A5A40]/5 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <h3 className="text-xl font-semibold group-hover:text-[#5A5A40] transition-colors">{proposal.title}</h3>
                      <p className="text-sm text-[#141414]/60 line-clamp-1">{proposal.description}</p>
                    </div>
                    <ChevronRight className="text-[#141414]/20 group-hover:text-[#5A5A40] transition-colors" />
                  </button>
                ))}
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
                className="flex items-center gap-2 text-sm font-medium text-[#141414]/60 hover:text-[#141414] transition-colors"
              >
                <ArrowLeft size={16} /> Back to proposals
              </button>

              <div className="space-y-4">
                <h2 className="text-3xl font-serif font-bold tracking-tight">{selectedProposal.title}</h2>
                <div className="bg-[#5A5A40]/10 p-4 rounded-xl flex items-start gap-3 border border-[#5A5A40]/20">
                  <Info size={20} className="text-[#5A5A40] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#5A5A40]/80 leading-relaxed">
                    Quadratic voting allows you to express the intensity of your preference. 
                    The cost of votes increases quadratically: 1 vote = 1 credit, 2 votes = 4 credits, 3 votes = 9 credits.
                  </p>
                </div>
              </div>

              {/* Credit Bar */}
              <div className="sticky top-20 z-10 bg-white p-6 rounded-2xl border border-[#141414]/10 shadow-lg space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-widest font-semibold text-[#141414]/40">Your Balance</span>
                    <div className="flex items-center gap-2 text-2xl font-mono font-bold">
                      <Wallet className="text-[#5A5A40]" />
                      {remainingCredits} <span className="text-sm font-normal text-[#141414]/40">/ {INITIAL_CREDITS} credits</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs uppercase tracking-widest font-semibold text-[#141414]/40">Used</span>
                    <div className="text-xl font-mono font-bold text-[#5A5A40]">
                      {totalCreditsUsed}
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-[#141414]/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-[#5A5A40]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(totalCreditsUsed / INITIAL_CREDITS) * 100}%` }}
                  />
                </div>
                
                {!isFullyAllocated && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
                    <AlertCircle size={14} />
                    You must use all 10 credits to submit your vote.
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
                        votes > 0 ? "border-[#5A5A40] shadow-md shadow-[#5A5A40]/5" : "border-[#141414]/10"
                      )}
                    >
                      <div className="space-y-1">
                        <h4 className="text-lg font-semibold">{option.name}</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono bg-[#141414]/5 px-2 py-1 rounded text-[#141414]/60">
                            {votes} {votes === 1 ? 'vote' : 'votes'}
                          </span>
                          {votes > 0 && (
                            <span className="text-xs font-mono text-[#5A5A40] font-bold">
                              Cost: {cost} credits
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => handleVoteChange(option.id, -1)}
                          disabled={votes === 0}
                          className="w-10 h-10 rounded-full border border-[#141414]/10 flex items-center justify-center hover:bg-[#141414]/5 disabled:opacity-20 transition-all"
                        >
                          <Minus size={18} />
                        </button>
                        <button
                          onClick={() => handleVoteChange(option.id, 1)}
                          disabled={!canAdd}
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                            canAdd 
                              ? "bg-[#5A5A40] text-white hover:scale-110 shadow-lg shadow-[#5A5A40]/20" 
                              : "bg-[#141414]/5 text-[#141414]/20 cursor-not-allowed"
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
                disabled={!isFullyAllocated}
                className="w-full py-4 bg-[#141414] text-white rounded-2xl font-bold text-lg hover:bg-[#141414]/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-xl shadow-[#141414]/20"
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
                <h2 className="text-4xl font-serif font-bold tracking-tight">Votes Recorded!</h2>
                <p className="text-[#141414]/60 max-w-sm mx-auto">
                  Your preferences have been successfully submitted to the quadratic voting pool.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Personal Summary */}
                <div className="bg-white p-8 rounded-3xl border border-[#141414]/10 space-y-6 text-left">
                  <h3 className="text-sm uppercase tracking-widest font-bold text-[#141414]/40">Your Allocation</h3>
                  <div className="space-y-3">
                    {Object.entries(allocations).map(([id, votes]) => {
                      if (votes === 0) return null;
                      const option = selectedProposal?.options.find(o => o.id === id);
                      return (
                        <div key={id} className="flex justify-between items-center py-2 border-b border-[#141414]/5 last:border-0">
                          <span className="font-medium text-sm">{option?.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono bg-[#5A5A40]/10 text-[#5A5A40] px-2 py-1 rounded">
                              {votes}v
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Global Summary */}
                <div className="bg-[#141414] p-8 rounded-3xl text-white space-y-6 text-left">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm uppercase tracking-widest font-bold text-white/40">Global Results</h3>
                    <Users size={16} className="text-white/40" />
                  </div>
                  <div className="space-y-3">
                    {selectedProposal?.options.map((option) => {
                      const totalVotes = globalVotes[option.id] || 0;
                      const maxGlobalVotes = Math.max(...Object.values(globalVotes).map(v => Number(v)), 1);
                      const percentage = (totalVotes / maxGlobalVotes) * 100;

                      return (
                        <div key={option.id} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-white/80">{option.name}</span>
                            <span className="font-mono text-[#5A5A40] font-bold">{totalVotes} votes</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-[#5A5A40]"
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
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
                className="px-8 py-3 border border-[#141414]/10 rounded-full font-medium hover:bg-[#141414]/5 transition-all"
              >
                Back to Home
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
                <h2 className="text-3xl font-serif font-bold tracking-tight">Share this App</h2>
                <p className="text-[#141414]/60">Scan the QR code to participate in the voting process.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-[#141414]/10 inline-block shadow-2xl">
                <QRCodeSVG 
                  value={appUrl} 
                  size={256}
                  level="H"
                  includeMargin={true}
                  className="mx-auto"
                />
                <div className="mt-6 p-3 bg-[#141414]/5 rounded-xl break-all text-xs font-mono text-[#141414]/60">
                  {appUrl}
                </div>
              </div>

              <div className="flex flex-col gap-4 max-w-xs mx-auto">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(appUrl);
                  }}
                  className="w-full py-3 bg-[#141414] text-white rounded-xl font-medium hover:bg-[#141414]/90 transition-all"
                >
                  Copy Link
                </button>
                <button
                  onClick={() => setView('list')}
                  className="w-full py-3 border border-[#141414]/10 rounded-xl font-medium hover:bg-[#141414]/5 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-2xl mx-auto px-6 py-12 border-t border-[#141414]/5 text-center space-y-4">
        <div className="flex justify-center gap-6">
          <div className="flex items-center gap-2 text-xs font-bold text-[#141414]/40 uppercase tracking-widest">
            <Trophy size={14} />
            Fair Governance
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#141414]/40 uppercase tracking-widest">
            <Vote size={14} />
            Quadratic Voting
          </div>
        </div>
        <p className="text-xs text-[#141414]/30">
          © 2026 Quadratic.Vote • Built for NS Discretionary Budgeting
        </p>
      </footer>
    </div>
  );
}
