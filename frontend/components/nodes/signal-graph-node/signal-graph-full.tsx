import { useState } from 'react';
import DataTable from '@/components/ui-data-table/data-table';
import {
   LineChart,
   Line,
   CartesianGrid,
   ResponsiveContainer,
   XAxis,
   YAxis,
} from 'recharts';
import { useGlobalContext } from '@/context/GlobalContext';
import { DivideCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';


interface SignalGraphViewProps {
   data: {
       time: string;
       signal1: number;
       signal2: number;
       signal3: number;
       signal4: number;
       signal5: number;
   }[];
}


export default function SignalGraphView({ data }: SignalGraphViewProps) {
   const { dataStreaming, setDataStreaming } = useGlobalContext();
   const [selectedSignal, setSelectedSignal] = useState<string | null>(null);


   const signals = [
       { key: 'signal1', colour: '#0000ff', name: 'Signal 1' },
       { key: 'signal2', colour: '#00ff00', name: 'Signal 2' },
       { key: 'signal3', colour: '#FF00D0', name: 'Signal 3' },
       { key: 'signal4', colour: '#FFFF00', name: 'Signal 4' },
       { key: 'signal5', colour: '#ff0000', name: 'Signal 5' },
   ];


   const handleStartStop = () => {
       setDataStreaming(!dataStreaming);
   };


   return (
       // take full height of the container
       <div className="w-full h-full grid gap-4">


           {/* ---- HEAD BUTTONS ---- */}
           <div className="flex justify-end mt-[-30px] space-x-[26px]">
               <Button
                   onClick={handleStartStop}
                   className={dataStreaming ? 'bg-red-500' : 'bg-[#2E7B75]'}
               >
                   {dataStreaming ? 'Stop Data Stream' : 'Start Data Stream'}
               </Button>


               <Button className='bg-[#2E7B75] text-white'> Save </Button>
           </div>


           {/* ---- TOP HALF: CHART ---- */}
           <div className="flex flex-col h-[55vh] border bg-white shadow-lg rounded-2xl p-4 overflow-hidden">
               <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={data} syncId="SignalChart">
                       <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                       <XAxis dataKey="time" />
                       <YAxis
                           type="number"
                           domain={[0, 100]}
                           ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                       />
                       {signals.map((s) => (
                           <Line
                               key={s.key}
                               dataKey={s.key}
                               isAnimationActive={false}
                               dot={false}
                               type="monotone"
                               stroke={selectedSignal === null ? s.colour : (selectedSignal === s.key ? s.colour : '#C0C0C0')}
                               name={s.name}
                           />
                       ))}
                   </LineChart>
               </ResponsiveContainer>


               {/* Signal selector */}
               <div className="flex gap-4 justify-center mt-2">
                   {signals.map((s) => {
                       const isSelected = selectedSignal === s.key;
                       const anySelected = selectedSignal !== null;


                       return (
                           <button
                               key={s.key}
                               onClick={() =>
                                   setSelectedSignal(isSelected ? null : s.key)
                               }
                               className="flex items-center gap-4 px-3 py-1 rounded transition"
                           >
                               <span
                                   className="w-7 h-0.5"
                                   style={{
                                       backgroundColor: anySelected ? (isSelected ? s.colour : '#C0C0C0') : s.colour,
                                   }}
                               />
                               <span
                                   className={anySelected ? (isSelected ? 'text-black' : 'text-gray-400') : 'text-black'}
                               >
                                   {s.name}
                               </span>
                           </button>
                       );
                   })}
               </div>
           </div>


           {/* ---- BOTTOM HALF: TABLE ---- */}
           <div className="bg-white border shadow-lg rounded-2xl p-4 overflow-auto">
               <DataTable data={data} />
           </div>


       </div>
   );
}
