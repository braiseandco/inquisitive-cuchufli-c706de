import os
import sys
import subprocess
import tkinter as tk
from datetime import date, datetime, timedelta
from pathlib import Path
from tkinter import ttk, filedialog, messagebox

import employes
import planning as planning_mod
import ods_parser
from contrat_pdf import generer_contrat


def _mardi_courant():
    """Renvoie la date du mardi de la semaine en cours (ou la plus récente passée)."""
    today = date.today()
    # weekday(): lundi=0, mardi=1, ..., dimanche=6
    delta = (today.weekday() - 1) % 7
    return today - timedelta(days=delta)

APP_DIR = Path(__file__).parent
OUTPUT_DIR = APP_DIR / "output"


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Contrats Extra - SAS ARP Biganos")
        self.geometry("980x640")
        self.minsize(880, 560)
        self.planning_data = None
        self.planning_path = None

        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=10, pady=10)

        self.tab_employes = EmployesTab(nb)
        self.tab_planning = PlanningTab(nb, self)
        self.tab_generate = GenerateTab(nb, self)

        nb.add(self.tab_employes, text="  Employés  ")
        nb.add(self.tab_planning, text="  Planning CSV  ")
        nb.add(self.tab_generate, text="  Générer contrats  ")


class EmployesTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.current_id = None

        left = ttk.Frame(self)
        left.pack(side="left", fill="y", padx=(8, 4), pady=8)
        right = ttk.Frame(self)
        right.pack(side="right", fill="both", expand=True, padx=(4, 8), pady=8)

        ttk.Label(left, text="Employés enregistrés", font=("Helvetica", 11, "bold")).pack(anchor="w")
        self.listbox = tk.Listbox(left, width=32, height=24)
        self.listbox.pack(fill="y", expand=False, pady=4)
        self.listbox.bind("<<ListboxSelect>>", self._on_select)

        btns = ttk.Frame(left)
        btns.pack(fill="x")
        ttk.Button(btns, text="Nouveau", command=self._nouveau).pack(side="left", padx=2)
        ttk.Button(btns, text="Supprimer", command=self._supprimer).pack(side="left", padx=2)

        ttk.Label(right, text="Fiche employé", font=("Helvetica", 11, "bold")).pack(anchor="w")
        form = ttk.Frame(right)
        form.pack(fill="x", pady=8)

        self.entries = {}
        for i, (key, label) in enumerate(employes.CHAMPS):
            ttk.Label(form, text=label + " :").grid(row=i, column=0, sticky="w", pady=3, padx=4)
            e = ttk.Entry(form, width=48)
            e.grid(row=i, column=1, sticky="we", pady=3, padx=4)
            self.entries[key] = e
        form.columnconfigure(1, weight=1)

        bbar = ttk.Frame(right)
        bbar.pack(fill="x", pady=8)
        ttk.Button(bbar, text="Enregistrer", command=self._save).pack(side="left", padx=4)
        ttk.Button(bbar, text="Vider", command=self._clear).pack(side="left", padx=4)

        self._reload()

    def _reload(self):
        self.listbox.delete(0, tk.END)
        self._employes_cache = employes.list_employes()
        for e in self._employes_cache:
            self.listbox.insert(tk.END, employes.display_name(e))

    def _on_select(self, _evt):
        sel = self.listbox.curselection()
        if not sel:
            return
        emp = self._employes_cache[sel[0]]
        self.current_id = emp["id"]
        for k, e in self.entries.items():
            e.delete(0, tk.END)
            e.insert(0, str(emp.get(k, "")))

    def _nouveau(self):
        self._clear()

    def _clear(self):
        self.current_id = None
        self.listbox.selection_clear(0, tk.END)
        for k, e in self.entries.items():
            e.delete(0, tk.END)
            if k in employes.DEFAULTS:
                e.insert(0, employes.DEFAULTS[k])

    def _save(self):
        data = {k: e.get().strip() for k, e in self.entries.items()}
        if not data.get("nom") or not data.get("prenom"):
            messagebox.showwarning("Champs manquants", "Nom et prénom sont obligatoires.")
            return
        # Vérif SMIC
        try:
            taux = float(data.get("taux_horaire", "0").replace(",", "."))
        except ValueError:
            taux = 0
        if 0 < taux < employes.SMIC_HORAIRE:
            ok = messagebox.askyesno(
                "Taux sous le SMIC",
                f"Le taux saisi ({taux:.2f} €/h) est inférieur au SMIC HCR "
                f"({employes.SMIC_HORAIRE:.2f} €/h).\n\nEnregistrer quand même ?",
            )
            if not ok:
                return
        if self.current_id:
            data["id"] = self.current_id
        saved = employes.save_employe(data)
        self.current_id = saved["id"]
        self._reload()
        messagebox.showinfo("OK", f"Employé enregistré : {employes.display_name(saved)}")

    def _supprimer(self):
        if not self.current_id:
            return
        if not messagebox.askyesno("Confirmer", "Supprimer cet employé ?"):
            return
        employes.delete_employe(self.current_id)
        self._clear()
        self._reload()


class PlanningTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app

        # Barre du haut : sélection semaine + import
        top = ttk.Frame(self)
        top.pack(fill="x", padx=8, pady=8)

        ttk.Label(top, text="Date du mardi de la semaine :").pack(side="left")
        self.entry_mardi = ttk.Entry(top, width=12)
        self.entry_mardi.insert(0, _mardi_courant().strftime("%d/%m/%Y"))
        self.entry_mardi.pack(side="left", padx=(4, 12))
        ttk.Button(top, text="Cette semaine", command=self._set_cette_semaine).pack(side="left")
        ttk.Button(top, text="Semaine suivante", command=lambda: self._shift_semaine(7)).pack(side="left", padx=4)
        ttk.Button(top, text="Semaine précédente", command=lambda: self._shift_semaine(-7)).pack(side="left")

        top2 = ttk.Frame(self)
        top2.pack(fill="x", padx=8, pady=(0, 8))
        ttk.Button(top2, text="Importer planning (ODS ou CSV)…", command=self._import).pack(side="left")
        self.lbl_file = ttk.Label(top2, text="Aucun fichier chargé")
        self.lbl_file.pack(side="left", padx=10)

        info = ttk.Label(
            self,
            text="ODS (.ods) : planning hebdo Calc — utilise la date du mardi ci-dessus pour générer les vraies dates.\n"
                 "CSV : employe;date;heure_debut;heure_fin;repas (la date est lue depuis le CSV).",
            foreground="#555",
        )
        info.pack(anchor="w", padx=8)

        paned = ttk.PanedWindow(self, orient="vertical")
        paned.pack(fill="both", expand=True, padx=8, pady=8)

        # --- Tableau récap (haut) ---
        frame_top = ttk.Frame(paned)
        paned.add(frame_top, weight=2)

        cols = ("employe", "jours", "total_heures", "total_repas")
        self.tree = ttk.Treeview(frame_top, columns=cols, show="headings", height=10)
        for c, t, w in [
            ("employe", "Employé", 260),
            ("jours", "Nb services", 110),
            ("total_heures", "Total heures", 140),
            ("total_repas", "Repas", 90),
        ]:
            self.tree.heading(c, text=t)
            self.tree.column(c, width=w, anchor="w")
        self.tree.pack(fill="both", expand=True)
        self.tree.bind("<<TreeviewSelect>>", self._on_select_employe)

        # --- Aperçu du planning détaillé (bas) ---
        frame_bot = ttk.Frame(paned)
        paned.add(frame_bot, weight=3)

        self.lbl_apercu = ttk.Label(
            frame_bot,
            text="Aperçu du planning : sélectionne un employé ci-dessus",
            font=("Helvetica", 10, "bold"),
        )
        self.lbl_apercu.pack(anchor="w", pady=(6, 4))

        detail_cols = ("date", "service", "horaire", "duree")
        self.tree_detail = ttk.Treeview(frame_bot, columns=detail_cols, show="headings", height=8)
        for c, t, w in [
            ("date", "Date", 130),
            ("service", "Service", 160),
            ("horaire", "Horaire", 160),
            ("duree", "Durée", 100),
        ]:
            self.tree_detail.heading(c, text=t)
            self.tree_detail.column(c, width=w, anchor="w")
        self.tree_detail.pack(fill="both", expand=True)

    def _set_cette_semaine(self):
        self.entry_mardi.delete(0, tk.END)
        self.entry_mardi.insert(0, _mardi_courant().strftime("%d/%m/%Y"))

    def _shift_semaine(self, days):
        try:
            cur = datetime.strptime(self.entry_mardi.get().strip(), "%d/%m/%Y").date()
        except ValueError:
            cur = _mardi_courant()
        nouveau = cur + timedelta(days=days)
        self.entry_mardi.delete(0, tk.END)
        self.entry_mardi.insert(0, nouveau.strftime("%d/%m/%Y"))

    def _get_mardi(self):
        try:
            return datetime.strptime(self.entry_mardi.get().strip(), "%d/%m/%Y").date()
        except ValueError:
            messagebox.showwarning("Date invalide", "Format attendu : JJ/MM/AAAA")
            return None

    def _import(self):
        path = filedialog.askopenfilename(
            title="Choisir un planning",
            filetypes=[("Planning", "*.ods *.csv"), ("ODS", "*.ods"), ("CSV", "*.csv"), ("Tous", "*.*")],
        )
        if not path:
            return
        ext = Path(path).suffix.lower()
        try:
            if ext == ".ods":
                mardi = self._get_mardi()
                if not mardi:
                    return
                data = ods_parser.parse_ods(path, mardi)
            else:
                data = planning_mod.parse_csv(path)
        except Exception as ex:
            messagebox.showerror("Erreur import", f"Impossible de lire le fichier :\n{ex}")
            return

        self.app.planning_data = data
        self.app.planning_path = path
        self.lbl_file.config(text=Path(path).name)
        self.tree.delete(*self.tree.get_children())
        for nom, p in data.items():
            self.tree.insert("", "end", iid=nom, values=(nom, len(p["jours"]), p["total_heures_str"], p["total_repas"]))
        self.tree_detail.delete(*self.tree_detail.get_children())
        self.lbl_apercu.config(text="Aperçu du planning : sélectionne un employé ci-dessus")
        self.app.tab_generate.refresh()

    def _on_select_employe(self, _evt):
        sel = self.tree.selection()
        self.tree_detail.delete(*self.tree_detail.get_children())
        if not sel or not self.app.planning_data:
            return
        nom = sel[0]
        p = self.app.planning_data.get(nom)
        if not p:
            return
        self.lbl_apercu.config(
            text=f"Aperçu — {nom}  ·  {len(p['jours'])} services  ·  {p['total_heures_str']}  ·  {p['total_repas']} repas"
        )
        for j in p["jours"]:
            horaire = f"{j['heure_debut']} - {j['heure_fin']}"
            # Durée payée = brut - 30 min de pause repas par service
            duree_payee = max(j["duree"] - 0.5, 0)
            duree_h = int(duree_payee)
            duree_m = round((duree_payee - duree_h) * 60)
            duree_str = f"{duree_h}h{duree_m:02d}" if duree_m else f"{duree_h}h"
            self.tree_detail.insert("", "end", values=(
                j["date"],
                j.get("service", "—"),
                horaire,
                duree_str,
            ))


class GenerateTab(ttk.Frame):
    CHECK_ON = "☑"
    CHECK_OFF = "☐"

    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app
        self._checked = set()

        info = ttk.Label(
            self,
            text="Coche les employés pour qui tu veux générer un contrat, puis clique "
                 "« Générer les cochés ». Clic sur la case ☐ pour cocher/décocher.",
            foreground="#555",
        )
        info.pack(anchor="w", padx=8, pady=(8, 4))

        topbar = ttk.Frame(self)
        topbar.pack(fill="x", padx=8, pady=(0, 4))
        ttk.Button(topbar, text="Tout cocher", command=self._tout_cocher).pack(side="left", padx=2)
        ttk.Button(topbar, text="Tout décocher", command=self._tout_decocher).pack(side="left", padx=2)
        ttk.Button(topbar, text="Inverser", command=self._inverser).pack(side="left", padx=2)

        cols = ("check", "employe_csv", "fiche", "statut")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", height=16, selectmode="browse")
        for c, t, w, anchor in [
            ("check", "✓", 40, "center"),
            ("employe_csv", "Nom dans le planning", 240, "w"),
            ("fiche", "Fiche employé associée", 240, "w"),
            ("statut", "Statut", 240, "w"),
        ]:
            self.tree.heading(c, text=t)
            self.tree.column(c, width=w, anchor=anchor)
        self.tree.pack(fill="both", expand=True, padx=8, pady=8)
        self.tree.bind("<Button-1>", self._on_click)

        bar = ttk.Frame(self)
        bar.pack(fill="x", padx=8, pady=8)
        ttk.Button(bar, text="Générer les cochés", command=self._generer_coches).pack(side="left", padx=4)
        ttk.Button(bar, text="Ouvrir dossier de sortie", command=self._ouvrir_output).pack(side="right", padx=4)

    def _checkbox(self, nom):
        return self.CHECK_ON if nom in self._checked else self.CHECK_OFF

    def refresh(self):
        self.tree.delete(*self.tree.get_children())
        if not self.app.planning_data:
            return
        noms_planning = set(self.app.planning_data.keys())
        # Décoche les noms qui ne sont plus dans le planning
        self._checked &= noms_planning
        for nom in self.app.planning_data.keys():
            emp = employes.find_by_name(nom)
            if emp:
                statut = "Prêt à générer"
                fiche = employes.display_name(emp)
                # Coche par défaut les employés dont la fiche est trouvée
                self._checked.add(nom)
            else:
                statut = "Aucune fiche - créer dans onglet Employés"
                fiche = "-"
                self._checked.discard(nom)
            self.tree.insert("", "end", iid=nom, values=(self._checkbox(nom), nom, fiche, statut))

    def _on_click(self, event):
        region = self.tree.identify_region(event.x, event.y)
        if region != "cell":
            return
        col = self.tree.identify_column(event.x)
        if col != "#1":  # colonne check
            return
        row = self.tree.identify_row(event.y)
        if not row:
            return
        emp = employes.find_by_name(row)
        if not emp:
            return  # pas de fiche → on ne peut pas cocher
        if row in self._checked:
            self._checked.discard(row)
        else:
            self._checked.add(row)
        vals = list(self.tree.item(row, "values"))
        vals[0] = self._checkbox(row)
        self.tree.item(row, values=vals)

    def _tout_cocher(self):
        for nom in self.tree.get_children():
            if employes.find_by_name(nom):
                self._checked.add(nom)
        self._refresh_checks()

    def _tout_decocher(self):
        self._checked.clear()
        self._refresh_checks()

    def _inverser(self):
        for nom in self.tree.get_children():
            if not employes.find_by_name(nom):
                continue
            if nom in self._checked:
                self._checked.discard(nom)
            else:
                self._checked.add(nom)
        self._refresh_checks()

    def _refresh_checks(self):
        for nom in self.tree.get_children():
            vals = list(self.tree.item(nom, "values"))
            vals[0] = self._checkbox(nom)
            self.tree.item(nom, values=vals)

    def _ouvrir_output(self):
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        if sys.platform.startswith("win"):
            os.startfile(str(OUTPUT_DIR))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(OUTPUT_DIR)])
        else:
            subprocess.Popen(["xdg-open", str(OUTPUT_DIR)])

    def _generer_pour(self, nom):
        emp = employes.find_by_name(nom)
        if not emp:
            return False, "Aucune fiche"
        p = self.app.planning_data[nom]
        slug = (emp.get("nom", "") + "_" + emp.get("prenom", "")).strip().replace(" ", "_")
        slug = "".join(c for c in slug if c.isalnum() or c in "_-")
        date_range = f"{p['date_debut'].replace('/', '-')}_au_{p['date_fin'].replace('/', '-')}"
        fichier = OUTPUT_DIR / f"contrat_extra_{slug}_{date_range}.pdf"
        try:
            generer_contrat(emp, p, fichier)
        except Exception as ex:
            return False, f"Erreur : {ex}"
        return True, str(fichier)

    def _generer_coches(self):
        if not self.app.planning_data:
            messagebox.showwarning("Planning", "Importe d'abord un planning.")
            return
        if not self._checked:
            messagebox.showinfo("Sélection", "Aucun employé coché.")
            return
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ok, ko = 0, []
        for nom in self._checked:
            success, msg = self._generer_pour(nom)
            if success:
                ok += 1
            else:
                ko.append(f"{nom} : {msg}")
        msg = f"{ok} contrat(s) généré(s) dans {OUTPUT_DIR}"
        if ko:
            msg += "\n\nNon générés :\n" + "\n".join(ko)
        messagebox.showinfo("Génération", msg)


if __name__ == "__main__":
    App().mainloop()
