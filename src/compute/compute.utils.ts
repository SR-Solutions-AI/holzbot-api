// apps/api/src/compute/compute.utils.ts

export function mapStepsToFrontendData(steps: Record<string, any>): any {
  // Extragem pașii cu fallback la obiect gol
  const dg = steps['dateGenerale'] || {};
  const client = steps['client'] || {};
  const sist = steps['sistemConstructiv'] || {};
  const mat = steps['materialeFinisaj'] || {};
  const perf = steps['performanta'] || {}; // Uneori e 'performantaEnergetica' in functie de formConfig
  const perfEn = steps['performantaEnergetica'] || {}; // Fallback dublu
  const log = steps['logistica'] || {};
  const cond = steps['conditiiSantier'] || {}; // Fallback pentru logistica

  // Combinăm datele (uneori câmpurile sunt în pași diferiți în funcție de versiunea form-ului)
  const finalPerf = { ...perf, ...perfEn };
  const finalLog = { ...log, ...cond };

  return {
    referinta: dg.referinta || "Proiect Standard",
    client: {
      nume: client.nume || "",
      telefon: client.telefon || "",
      email: client.email || "",
      localitate: client.localitate || ""
    },
    sistemConstructiv: {
      tipSistem: sist.tipSistem || "Holzrahmen",
      gradPrefabricare: sist.gradPrefabricare || "Panouri",
      tipFundatie: sist.tipFundatie || "Placă",
      
      // ✅ ADĂUGAT: Câmpurile noi pentru acoperiș
      tipAcoperis: sist.tipAcoperis || "Două ape",
      materialPereti: sist.materialPereti || ""
    },
    materialeFinisaj: {
      nivelOferta: mat.nivelOferta || "Structură + ferestre",
      finisajInterior: mat.finisajInterior || "Tencuială",
      fatada: mat.fatada || "Tencuială",
      tamplarie: mat.tamplarie || "PVC",
      
      // ✅ ADĂUGAT: Câmpurile noi pentru materiale și izolație
      materialAcoperis: mat.materialAcoperis || "Țiglă",
      tipTermoizolatie: mat.tipTermoizolatie || "",
      grosimeTermoizolatie: mat.grosimeTermoizolatie || 0,
      invelitoare: mat.invelitoare || ""
    },
    performanta: {
      nivelEnergetic: finalPerf.nivelEnergetic || finalPerf.clasaEnergetica || "KfW 55",
      incalzire: finalPerf.incalzire || "Pompa de căldură",
      // Conversie la boolean sigur
      ventilatie: finalPerf.ventilatie === true || finalPerf.ventilatie === 'true' || String(finalPerf.ventilatie).includes('recuperare')
    },
    logistica: {
      accesSantier: finalLog.accesSantier || "Ușor (camion 40t)",
      teren: finalLog.teren || "Plan",
      utilitati: finalLog.utilitati === true || finalLog.utilitati === 'true' || !!finalLog.utilitati
    }
  };
}