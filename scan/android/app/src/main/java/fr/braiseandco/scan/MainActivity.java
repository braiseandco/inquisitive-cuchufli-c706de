package fr.braiseandco.scan;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Base64;
import android.util.Patterns;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

// Scanner de Google (le même moteur que l'appli du Pixel : détection, prise auto, recadrage, filtres),
// puis envoi du PDF par le script Google du restaurant, qui le mail et le range dans Drive /Scans/AAAA-MM.
public class MainActivity extends Activity {
    // Même script que l'appli web /scan/ et les commandes fournisseurs (commandes-mail/envoyer-commande.gs)
    static final String SCRIPT = "https://script.google.com/macros/s/AKfycby33o4eLrk5ACzJwkLJ91Zr9iWeZmDWAzUx3fIrcJs9mORUNZAPceugRA51SoIJ030M/exec";
    static final String COMPTABLE = "M.Mailles@agen-ece.com";
    static final String SAMIER = "J.Samier@groupe-ece.com";
    static final int REQ_SCAN = 1;
    static final int ORANGE = 0xFFFF7A1A, FOND = 0xFF141414, PANNEAU = 0xFF262626;

    Uri pdf;
    int nbPages;
    EditText titre, autre;
    TextView statut;
    LinearLayout blocAutre, recents;
    Button btnAutre;
    final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(FOND);
        if (b != null && b.getString("pdf") != null) { pdf = Uri.parse(b.getString("pdf")); nbPages = b.getInt("n"); ecranEnvoi(); }
        else scanner();
    }

    @Override
    protected void onSaveInstanceState(Bundle o) {
        super.onSaveInstanceState(o);
        if (pdf != null) { o.putString("pdf", pdf.toString()); o.putInt("n", nbPages); }
    }

    void scanner() {
        GmsDocumentScannerOptions opts = new GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(30)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                .build();
        GmsDocumentScanner s = GmsDocumentScanning.getClient(opts);
        s.getStartScanIntent(this)
                .addOnSuccessListener(sender -> {
                    try { startIntentSenderForResult(sender, REQ_SCAN, null, 0, 0, 0); }
                    catch (IntentSender.SendIntentException e) { erreur("Scanner indisponible : " + e.getMessage()); }
                })
                .addOnFailureListener(e -> erreur("Scanner Google indisponible : " + e.getMessage()
                        + "\n\nVérifiez que les services Google Play sont à jour."));
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_SCAN) return;
        GmsDocumentScanningResult r = res == RESULT_OK ? GmsDocumentScanningResult.fromActivityResultIntent(data) : null;
        if (r == null || r.getPdf() == null) {
            if (pdf == null) finish();
            return;
        }
        pdf = r.getPdf().getUri();
        nbPages = r.getPdf().getPageCount();
        ecranEnvoi();
    }

    // ─── Écran d'envoi ───
    void ecranEnvoi() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(18), dp(28), dp(18), dp(24));

        TextView h = texte("DOCUMENT SCANNÉ", 26, Color.WHITE);
        h.setTypeface(Typeface.DEFAULT_BOLD);
        col.addView(h);
        col.addView(texte(nbPages + (nbPages > 1 ? " pages" : " page") + " — PDF prêt", 15, 0xFF9A9A9A));

        col.addView(label("Nom du document"));
        titre = champ("ex. Facture Metro", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        col.addView(titre);

        col.addView(gros("Envoyer à M. Mailles", true, v -> envoyer(COMPTABLE)));
        TextView sous = texte("Comptable — cabinet ECE", 13, 0xFF9A9A9A);
        sous.setGravity(Gravity.CENTER);
        col.addView(sous);

        col.addView(gros("Envoyer à Mme Samier", true, v -> envoyer(SAMIER)));
        TextView sousSamier = texte("Social et paie — cabinet ECE", 13, 0xFF9A9A9A);
        sousSamier.setGravity(Gravity.CENTER);
        col.addView(sousSamier);

        btnAutre = gros("Autre adresse…", false, v -> { blocAutre.setVisibility(View.VISIBLE); btnAutre.setVisibility(View.GONE); autre.requestFocus(); });
        col.addView(btnAutre);

        blocAutre = new LinearLayout(this);
        blocAutre.setOrientation(LinearLayout.VERTICAL);
        blocAutre.setVisibility(View.GONE);
        blocAutre.addView(label("Adresse mail"));
        autre = champ("adresse@mail.fr", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        blocAutre.addView(autre);
        recents = new LinearLayout(this);
        recents.setOrientation(LinearLayout.VERTICAL);
        for (String m : contacts()) {
            Button c = petit(m, v -> autre.setText(m));
            recents.addView(c);
        }
        blocAutre.addView(recents);
        blocAutre.addView(gros("Envoyer à cette adresse", true, v -> envoyer(autre.getText().toString().trim())));
        col.addView(blocAutre);

        statut = texte("", 16, Color.WHITE);
        statut.setPadding(0, dp(16), 0, 0);
        col.addView(statut);

        col.addView(gros("Refaire le scan", false, v -> scanner()));

        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(FOND);
        sv.setFillViewport(true);
        sv.addView(col);
        setContentView(sv);
    }

    void envoyer(String dest) {
        if (!Patterns.EMAIL_ADDRESS.matcher(dest).matches()) { statut("Adresse mail invalide", 0xFFFF5A5A); return; }
        String t = titre.getText().toString().trim();
        statut("Envoi en cours…", Color.WHITE);
        setEnabled(false);
        new Thread(() -> {
            try {
                byte[] octets = lire(pdf);
                JSONObject scan = new JSONObject()
                        .put("dest", dest).put("titre", t.isEmpty() ? "Scan" : t)
                        .put("pdf", Base64.encodeToString(octets, Base64.NO_WRAP));
                JSONObject req = new JSONObject().put("scan", scan).put("cle", BuildConfig.SCAN_CLE);
                JSONObject rep = new JSONObject(post(req.toString()));
                if (!rep.optBoolean("ok")) throw new Exception(rep.optString("error", "Envoi refusé"));
                if (!dest.equals(COMPTABLE) && !dest.equals(SAMIER)) retenir(dest);
                String nom = rep.optString("nom");
                ui.post(() -> { statut("PDF envoyé à " + dest + "\nRangé sur le PC : Scans\\" + (nom.length() >= 7 ? nom.substring(0, 7) : "") + "\\" + nom, 0xFF3ECF6E); setEnabled(true); });
            } catch (Exception e) {
                ui.post(() -> { statut("Échec : " + e.getMessage() + "\nRien n'est parti, réessayez.", 0xFFFF5A5A); setEnabled(true); });
            }
        }).start();
    }

    // Le script Google répond par une redirection vers la vraie réponse : on la suit à la main en GET
    String post(String corps) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(SCRIPT).openConnection();
        c.setInstanceFollowRedirects(false);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(120000);
        c.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
        try (OutputStream o = c.getOutputStream()) { o.write(corps.getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        if (code >= 300 && code < 400) {
            String loc = c.getHeaderField("Location");
            c.disconnect();
            c = (HttpURLConnection) new URL(loc).openConnection();
            c.setReadTimeout(60000);
            code = c.getResponseCode();
        }
        if (code != 200) throw new Exception("Serveur " + code);
        return new String(tout(c.getInputStream()), StandardCharsets.UTF_8);
    }

    byte[] lire(Uri u) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(u)) { return tout(in); }
    }

    static byte[] tout(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toByteArray();
    }

    // ─── Adresses récentes ───
    List<String> contacts() {
        SharedPreferences p = getSharedPreferences("scan", MODE_PRIVATE);
        List<String> l = new ArrayList<>();
        for (String m : p.getString("contacts", "").split("\n")) if (!m.isEmpty()) l.add(m);
        return l;
    }

    void retenir(String m) {
        List<String> l = contacts();
        l.remove(m);
        l.add(0, m);
        while (l.size() > 6) l.remove(l.size() - 1);
        getSharedPreferences("scan", MODE_PRIVATE).edit().putString("contacts", String.join("\n", l)).apply();
    }

    // ─── Petits éléments d'interface ───
    void erreur(String m) {
        ecranEnvoiVide();
        statut(m, 0xFFFF5A5A);
    }

    void ecranEnvoiVide() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(18), dp(28), dp(18), dp(24));
        col.setBackgroundColor(FOND);
        statut = texte("", 16, Color.WHITE);
        col.addView(statut);
        col.addView(gros("Réessayer", true, v -> scanner()));
        setContentView(col);
    }

    void statut(String m, int couleur) { statut.setText(m); statut.setTextColor(couleur); }

    void setEnabled(boolean on) {
        View v = getWindow().getDecorView();
        activer(v, on);
    }

    void activer(View v, boolean on) {
        if (v instanceof Button) v.setEnabled(on);
        if (v instanceof android.view.ViewGroup) {
            android.view.ViewGroup g = (android.view.ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) activer(g.getChildAt(i), on);
        }
    }

    TextView texte(String s, int sp, int couleur) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(couleur);
        return t;
    }

    TextView label(String s) {
        TextView t = texte(s, 14, 0xFF9A9A9A);
        t.setPadding(0, dp(18), 0, dp(6));
        return t;
    }

    EditText champ(String indice, int type) {
        EditText e = new EditText(this);
        e.setHint(indice);
        e.setHintTextColor(0xFF6A6A6A);
        e.setTextColor(Color.WHITE);
        e.setTextSize(17);
        e.setInputType(type);
        e.setSingleLine(true);
        e.setPadding(dp(14), dp(12), dp(14), dp(12));
        e.setBackground(fond(PANNEAU));
        return e;
    }

    Button gros(String s, boolean principal, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(18);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(principal ? 0xFF111111 : Color.WHITE);
        b.setBackground(fond(principal ? ORANGE : PANNEAU));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(58));
        lp.topMargin = dp(16);
        b.setLayoutParams(lp);
        return b;
    }

    Button petit(String s, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setTextColor(Color.WHITE);
        b.setBackground(fond(PANNEAU));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        lp.topMargin = dp(8);
        b.setLayoutParams(lp);
        return b;
    }

    GradientDrawable fond(int couleur) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(couleur);
        d.setCornerRadius(dp(12));
        return d;
    }

    int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
