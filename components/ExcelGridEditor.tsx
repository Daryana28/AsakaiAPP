"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function ExcelGridEditor({ issueId }: { issueId: number }) {
  const { data } = useSWR(`/api/issues/${issueId}/sheet`, fetcher);
  const [aoa, setAoa] = useState<any[][]>([]);

  useEffect(() => {
    if (data?.aoa) setAoa(data.aoa);
  }, [data]);

  const setCell = (r:number,c:number,v:string)=>{
    setAoa(p=>{
      const n = p.map(row=>[...row]);
      if(!n[r]) n[r]=[];
      n[r][c]=v;
      return n;
    });
  };

  const save = async()=>{
    await fetch(`/api/issues/${issueId}/sheet-save`,{
      method:"POST",
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ aoa })
    });
    alert("Excel tersimpan");
  };

  return (
    <>
      <div className="overflow-auto max-h-[60vh] border">
        <table>
          <tbody>
            {aoa.map((row,r)=>(
              <tr key={r}>
                {row.map((cell,c)=>(
                  <td key={c} className="border">
                    <input
                      value={cell}
                      onChange={e=>setCell(r,c,e.target.value)}
                      className="w-28 p-1"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={save} className="mt-3 px-4 py-2 bg-emerald-600 text-white">
        Simpan Excel
      </button>
    </>
  );
}
