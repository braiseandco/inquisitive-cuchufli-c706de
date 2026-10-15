// Contrats CDI / CDD (CCN HCR) générés depuis la fiche salarié.
// Base : CDI EPHREM 35h (octobre 2026) ; clause logement reprise du CDI VIRENQUE.

const EMPLOYEUR_CONTRAT = {
  societe: 'ARP BIGANOS',
  adresse: "174 Avenue de la Côte d'Argent",
  cp_ville: '33380 BIGANOS',
  siret: '81990125700017',
  ape: '5610A',
  representant: 'M. FARGE Alexandre',
  qualite: 'Directeur',
  urssaf: '727000000652215161',
  klesia_retraite: 'KLESIA Retraite ARRCO (ex-CGIS) 4-22 Rue Marie-Georges Picquart - 75017 PARIS',
  klesia_prevoyance: 'KLESIA Prévoyance (ex-IPGM, ex-APGME) 4-22 Rue Marie-Georges Picquart - 75017 PARIS',
  logement_defaut: '18 G Rue des Navarries 33380 MIOS',
};

const CONTRAT_TYPES_IMPRIMABLES = ['CDI', 'CDD', 'CDD saisonnier'];

function _ctEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function _ctDateLong(ymd) {
  if (!ymd) return '……………';
  const [y, m, d] = ymd.split('-').map(Number);
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return `${d === 1 ? '1er' : d} ${mois[m - 1]} ${y}`;
}
function _ctEuros(n) {
  return n.toFixed(2).replace('.', ',');
}
function _ctRoman(n) {
  return ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'][n - 1];
}

// Période d'essai par défaut. CDD : 1 jour par semaine, plafond 2 semaines si ≤ 6 mois, 1 mois au-delà (L. 1242-10).
// CDI niveau I échelon 1 : 2 mois non renouvelables (L. 1221-19 + CCN HCR).
function essaiParDefaut(type, debut, fin) {
  if (type === 'CDI') return '2 mois';
  if (!debut || !fin) return '';
  const jours = Math.round((new Date(fin) - new Date(debut)) / 86400000) + 1;
  const sixMois = new Date(debut); sixMois.setMonth(sixMois.getMonth() + 6);
  if (new Date(fin) >= sixMois) return '1 mois';
  const j = Math.min(14, Math.max(1, Math.floor(jours / 7)));
  return `${j} jour${j > 1 ? 's' : ''}`;
}

// Champs manquants pour pouvoir éditer le contrat (liste lisible).
function contratChampsManquants(emp) {
  const req = [['nom','nom'],['prenom','prénom'],['adresse','adresse'],['date_naissance','date de naissance'],
    ['lieu_naissance','lieu de naissance'],['num_secu','n° sécu'],['date_arrivee','début du contrat'],['heures_hebdo_contrat','heures/semaine']];
  if (emp.type_contrat === 'CDD' || emp.type_contrat === 'CDD saisonnier') req.push(['date_fin_contrat','fin du contrat']);
  if (emp.type_contrat === 'CDD') req.push(['motif_cdd','motif du CDD']);
  if (emp.type_contrat === 'CDD' && emp.motif_cdd === 'remplacement') req.push(['personne_remplacee','personne remplacée']);
  return req.filter(([k]) => emp[k] == null || emp[k] === '').map(([, l]) => l);
}

// Répartition hebdo (temps partiel) depuis les horaires de base du planning.
function _ctRepartition(scheds) {
  const jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
  const lignes = [];
  for (let d = 1; d <= 7; d++) {
    const s = (scheds || []).find(x => x.day_of_week === d);
    const h = s ? calcDayHours(s) : 0;
    if (h > 0) lignes.push(`- ${jours[d - 1]} : ${String(+h.toFixed(2)).replace('.', ',')} heures`);
  }
  return lignes;
}

function contratSalarieHtml(emp, scheds) {
  const E = EMPLOYEUR_CONTRAT;
  const f = emp.civilite !== 'Mr';
  const e = f ? 'e' : '';
  const il = f ? 'elle' : 'il';
  const Il = f ? 'Elle' : 'Il';
  const leSal = f ? 'la salariée' : 'le salarié';
  const X = `<b>${f ? 'Mme' : 'M.'} ${_ctEsc(String(emp.nom).toUpperCase())} ${_ctEsc(emp.prenom)}</b>`;
  const type = emp.type_contrat;
  const isCdd = type !== 'CDI';
  const saisonnier = type === 'CDD saisonnier';
  const heures = +emp.heures_hebdo_contrat;
  const partiel = heures < 35;
  const heuresMois = Math.round(heures * 52 / 12 * 100) / 100;
  const taux = +(emp.taux_horaire || SMIC_HORAIRE_HCR);
  const brut = Math.round(taux * heuresMois * 100) / 100;
  const essai = emp.periode_essai || essaiParDefaut(type, emp.date_arrivee, emp.date_fin_contrat);
  const emploi = emp.emploi || (f ? 'Employée polyvalente' : 'Employé polyvalent');
  const loge = +(emp.loyer_logement || 0) > 0;
  const hStr = String(heures).replace('.', ',');

  const titre = `CONTRAT DE TRAVAIL A TEMPS ${partiel ? 'PARTIEL' : 'COMPLET'}<br>A DUREE ${isCdd ? 'DETERMINEE' + (saisonnier ? ' SAISONNIER' : '') : 'INDETERMINEE'}`;
  const articles = [];
  const art = (titreArt, paras) => articles.push({titre: titreArt, paras});

  art('Engagement', [
    "La déclaration préalable à l'embauche a été remise à l'URSSAF d'Aquitaine.",
    `Conformément à la loi du 6 janvier 1978, ${X} a un droit d'accès et de rectification aux informations portées sur ce document.`,
    `A ce titre, ${X} atteste la véracité des informations d'état civil ${f ? 'la' : 'le'} concernant, et notamment, son identité, sa date et son lieu de naissance ainsi que sa nationalité.`,
    `Le présent contrat est conclu conformément aux dispositions légales et réglementaires en vigueur ainsi qu'aux dispositions de la Convention Collective Nationale des Hôtels, Cafés, Restaurants du 30 avril 1997 (IDCC 1979) et aux dispositions des accords d'entreprise en vigueur ou à venir dans l'entreprise, ou toutes dispositions qui s'y substitueraient le cas échéant. Au cas où, à l'avenir, une autre convention collective s'avérait applicable à l'entreprise, le contrat de travail ${f ? 'de la salariée' : 'du salarié'} y serait automatiquement soumis.`,
    `${X} est engagé${e} à compter du ${_ctDateLong(emp.date_arrivee)} par la société ${E.societe}.`,
  ]);

  const essaiParas = [
    'Toute suspension qui se produirait pendant la période d\'essai (maladie, congés…) prolongerait d\'autant la durée de cette période, qui doit correspondre à un travail effectif.',
    `Pendant cette période d'essai, la société ${E.societe} pourra mettre fin au contrat sans indemnité, moyennant le respect d'un délai de prévenance fixé par les dispositions de la convention collective applicable à l'entreprise ou par l'article L 1221-25 du code du travail le cas échéant.`,
    "Conformément à l'article L 1221-25 du code du travail, la période d'essai, renouvellement inclus, ne peut être prolongée du fait de la durée du délai de préavis indiqué ci-dessus, en cas de rupture.",
    `Si ${X} souhaite rompre la période d'essai, ${il} devra prévenir la société ${E.societe} dans les conditions fixées par l'article L. 1221-26 du code du travail :<br>- 24 heures à l'avance si la durée de présence dans l'entreprise est inférieure à 8 jours ;<br>- 48 heures à l'avance au-delà.`,
  ];
  if (!isCdd) {
    art("Durée et date d'effet - Période d'essai", [
      `Ce contrat est conclu pour une durée indéterminée. Il ne prendra effet définitivement qu'à l'issue de la période d'essai de ${_ctEsc(essai)}.`,
      ...essaiParas,
    ]);
  } else {
    const motif = saisonnier
      ? `La société ${E.societe}, exerçant une activité de restauration soumise à des variations saisonnières, engage ${X} pour la durée de la saison touristique, conformément aux dispositions de l'article L. 1242-2, 3° du Code du travail.`
      : emp.motif_cdd === 'remplacement'
        ? `Le présent contrat est conclu pour assurer le remplacement de ${_ctEsc(emp.personne_remplacee)}, salarié(e) absent(e), conformément aux dispositions de l'article L. 1242-2, 1° du Code du travail.`
        : `Le présent contrat est conclu pour faire face à un accroissement temporaire de l'activité de l'entreprise, conformément aux dispositions de l'article L. 1242-2, 2° du Code du travail.`;
    art("Motif, durée et période d'essai", [
      motif,
      `Il est conclu pour une durée déterminée, du ${_ctDateLong(emp.date_arrivee)} au ${_ctDateLong(emp.date_fin_contrat)} inclus. Il prendra fin automatiquement à l'échéance de ce terme, sans autre formalité.`,
      `Il pourra être renouvelé deux fois au plus, par avenant proposé à ${X} avant le terme initialement prévu, dans les limites fixées par les articles L. 1243-13 et L. 1242-8 du Code du travail${saisonnier ? ' et de la durée de la saison restant à courir' : ''}.`,
      `Le présent contrat comporte une période d'essai de ${_ctEsc(essai)}, décomptée en jours calendaires (article L. 1242-10 du Code du travail).`,
      ...essaiParas,
    ]);
  }

  art('Fonctions', [
    `${X} exercera au sein de la société les fonctions d'${_ctEsc(emploi)}.`,
    emp.niveau ? `Cette qualification correspond au Niveau ${_ctEsc(emp.niveau)}, Echelon ${_ctEsc(emp.echelon || '1')}, prévu par la convention collective des Hôtels, Cafés, Restaurants.` : '',
    `${X} pourra être conduit${e} à effectuer toute tâche relevant de sa qualification sans que cela puisse constituer une modification de son contrat de travail.`,
    `A titre informatif, ces fonctions seront exercées à l'établissement situé ${E.adresse} ${E.cp_ville}, ainsi que dans tous les lieux où ${il} pourra être amené${e} à intervenir dans le cadre de ses fonctions.`,
  ]);

  if (!partiel) {
    art('Horaire de travail et jour de repos', [
      `La durée hebdomadaire de travail de ${X} est de ${hStr} heures.`,
      `Le cas échéant, des heures supplémentaires pourront être demandées à ${X} en fonction des nécessités de l'entreprise et dans le cadre des dispositions légales et conventionnelles.`,
      "Il est rappelé que seules les heures supplémentaires expressément demandées par l'employeur seront indemnisées, conformément aux dispositions légales.",
      `Les horaires et jours de repos sont déterminés par l'employeur. ${X} est tenu${e} de les respecter. Ils peuvent être modifiés en cas de besoin du service ou de réorganisation.`,
      'Ces modifications ne pourront en aucun cas être considérées comme une modification du contrat de travail.',
    ]);
  } else {
    const rep = _ctRepartition(scheds);
    art('Durée du travail et répartition', [
      `La durée hebdomadaire de travail de ${X} est de ${hStr} heures, soit ${String(heuresMois).replace('.', ',')} heures par mois.`,
      rep.length ? `Cette durée est répartie entre les jours de la semaine de la façon suivante :<br>${rep.join('<br>')}` : 'La répartition de cette durée entre les jours de la semaine est fixée par le planning remis au salarié.',
      `Toute modification de cette répartition sera notifiée à ${X} au moins 7 jours ouvrés avant la date à laquelle elle doit intervenir, dans les cas suivants : surcroît ou baisse d'activité, absence d'un salarié, réorganisation du service.`,
      `Des heures complémentaires pourront être demandées à ${X} dans la limite du dixième de la durée prévue au contrat ; chacune d'elles sera majorée de 10 %. Elles ne pourront avoir pour effet de porter la durée du travail au niveau de la durée légale.`,
      `Les horaires de travail sont communiqués par écrit à ${X} au moyen du planning affiché dans l'établissement.`,
    ]);
  }

  art('Affichage et contrôle de la durée du travail', [
    `Conformément aux dispositions de la convention collective des Hôtels, Cafés, Restaurants, l'employeur est tenu d'afficher les horaires de travail et de contrôler la durée du travail applicable au personnel salarié. A cette fin, le chef d'entreprise enregistrera sur un registre ou tout autre document l'horaire de ${X}.`,
    `La durée du travail de ${X} sera décomptée selon les modalités suivantes :<br>1. quotidiennement, par enregistrement des heures de début et de fin de chaque période de travail ou par le relevé du nombre d'heures effectuées ;<br>2. chaque semaine par récapitulation du nombre d'heures de travail effectuées ;<br>3. un document mensuel, qui comportera les mentions suivantes : le cumul des heures supplémentaires effectuées depuis le début de l'année, comportant, si les heures supplémentaires donnent lieu à repos, le nombre d'heures de repos compensateur acquises au cours du mois en distinguant, le cas échéant, le repos compensateur légal et le repos compensateur de remplacement, le nombre d'heures de repos compensateur effectivement prises au cours du mois.`,
    `Ce document sera émargé par ${leSal} au moins une fois par semaine et sera tenu à disposition de l'inspection du travail.`,
    `${f ? 'La salariée' : 'Le salarié'} s'engage à respecter les procédures de suivi des temps de travail mises en œuvre dans l'entreprise.`,
  ]);

  art('Rémunération', [
    `${X} bénéficiera d'une rémunération mensuelle brute de ${_ctEuros(brut)}€ pour ${String(heuresMois).replace('.', ',')} heures, sur la base d'un taux horaire brut de ${_ctEuros(taux)}€${taux <= SMIC_HORAIRE_HCR ? ', correspondant au SMIC en vigueur' : ''}, à laquelle s'ajouteront les éventuels avantages en nature dus.`,
    'Cette rémunération s\'entend pour un mois complet et normal de travail.',
    `Le cas échéant, s'y ajoutera tout élément de rémunération prévu par les dispositions légales ou conventionnelles en vigueur et applicables selon les conditions d'emploi de ${leSal}.`,
    isCdd && !saisonnier ? `A l'échéance du terme, si les relations contractuelles ne se poursuivent pas par un contrat à durée indéterminée, ${X} percevra une indemnité de fin de contrat égale à 10 % de la rémunération totale brute versée, conformément à l'article L. 1243-8 du Code du travail.` : '',
    saisonnier ? "Conformément à l'article L. 1243-10 du Code du travail, l'indemnité de fin de contrat n'est pas due au titre d'un contrat saisonnier." : '',
  ]);

  art('Présentation professionnelle', [
    `${X} reconnaît être conscient${e} du fait que l'activité de la société est par nature, un secteur hautement concurrentiel dans lequel l'accueil, le service et la qualité de la prestation occupent une place importante.`,
    `De par sa fonction, ${X} sera en contact direct et permanent avec la clientèle. C'est pourquoi, ${X} s'engage à adopter dans l'exercice de son travail toute la rigueur et le sérieux permettant d'offrir à chaque client, un service correspondant à ses attentes et fidèle à l'esprit que véhicule la société.`,
    `Ainsi, ${X} veillera à présenter à la clientèle, une conduite et une apparence en accord avec sa fonction et en cohérence avec le contexte professionnel et l'image de l'enseigne. A cet effet, ${X} sera tenu${e} de porter la tenue vestimentaire qui lui a été remise lors de l'embauche ainsi que de s'assurer de sa propreté et de son parfait état (sans déchirure, sans tâche et repassée) lors de la prise de chacun de ses services. En outre, ${leSal} veillera à prévenir l'employeur en cas d'usure, de dégradation ou de perte d'un des éléments composant cette tenue de travail. À cet effet, l'employeur s'occupera de la réparation ou du remplacement de ladite tenue.`,
    `${f ? 'La salariée' : 'Le salarié'} devra restituer cette tenue lors de son départ de l'entreprise (ou d'une interruption d'activité de longue durée ou d'une modification de fonction ne requérant plus son usage) et ce, sur première demande de la Direction.`,
    `Plus généralement, ${X} conservera tout au long de l'exécution de son travail, une attitude accueillante et disponible dans le souci de satisfaire dans la mesure du possible, les attentes et les besoins de la clientèle.`,
    `Enfin, ${X} reconnaît que sa présentation ainsi que l'accueil et le service offerts à la clientèle constituent une condition substantielle du bon accomplissement de son travail et que leur non-respect serait susceptible de l'exposer à une sanction disciplinaire pouvant aller jusqu'à une remise en cause de sa collaboration avec la société, dans le respect des dispositions légales et conventionnelles en vigueur.`,
  ]);

  art('Discrétion et concurrence', [
    `Durant l'exécution de sa mission et au-delà, ${X} sera tenu${e} indépendamment d'une obligation de réserve générale et de secret professionnel, à une discrétion absolue sur tous les faits, informations, connaissances et techniques de quelque nature qu'ils soient, qu'${il} pourrait connaître en raison de ses fonctions ou de son appartenance à l'entreprise.`,
    `Les imprimés, documents ou rapports que ${X} sera amené${e} à établir ou dont communication lui sera donnée, sont la propriété de la société ${E.societe} et ${il} ne pourra ni les conserver, ni en prendre copie, ni en donner communication à des tiers sans accord écrit de la Direction.`,
    `${Il} s'engage à n'exercer aucune activité concurrente de celle de la société pendant toute la durée de son contrat de travail.`,
  ]);

  art('Absences', [
    `${X} est tenu${e} de prévenir immédiatement la société ${E.societe} de toute absence pour maladie ou accident. ${Il} devra fournir un certificat médical justifiant son absence dans un délai de 48 heures.`,
    `En cas de prolongation d'arrêt de travail, ${X} devra transmettre dans les mêmes délais le certificat médical justifiant cette prolongation.`,
    "Toute autre absence n'entrant pas dans le cadre des absences précitées devra faire l'objet d'une autorisation de la Direction.",
  ]);

  art('Congés payés', [
    `${X} aura droit aux congés payés prévus par les articles L 3141-1 et suivants du Code du travail et par la convention collective des Hôtels, Cafés, Restaurants applicable dans l'entreprise.`,
    "La prise effective des congés sera déterminée en application des dispositions conventionnelles ou des pratiques en vigueur dans l'entreprise ou, à défaut, par accord avec la direction, compte tenu des nécessités du service.",
    isCdd ? `Les congés acquis et non pris à l'échéance du contrat donneront lieu au versement d'une indemnité compensatrice de congés payés égale à 10 % de la rémunération totale brute perçue, conformément à l'article L. 1242-16 du Code du travail.` : '',
  ]);

  if (!isCdd) {
    art('Rupture du contrat de travail', [
      `En application des dispositions légales et conventionnelles applicables dans l'entreprise, ${X} et la société ${E.societe} peuvent l'une et l'autre rompre le contrat de travail, sous réserve de respecter, le cas échéant, les délais prévus par les dispositions conventionnelles ou, à défaut, par les articles L 1237-1 et L 1234-1 du Code du travail.`,
    ]);
  } else {
    art('Rupture anticipée', [
      `En dehors de la période d'essai, le présent contrat ne pourra être rompu avant l'échéance du terme qu'en cas d'accord des parties, de faute grave, de force majeure ou d'inaptitude constatée par le médecin du travail, conformément à l'article L. 1243-1 du Code du travail.`,
      `${X} pourra également rompre le contrat de manière anticipée s'${il} justifie d'une embauche en contrat à durée indéterminée, en respectant le préavis prévu à l'article L. 1243-2 du Code du travail.`,
    ]);
  }

  art('Avantages sociaux', [
    `${X} bénéficiera des avantages sociaux consentis au personnel de sa catégorie, conformément aux dispositions conventionnelles et légales, notamment en ce qui concerne le régime de retraite, de prévoyance et de frais de santé.`,
    `La société ${E.societe} informe ${X} à titre indicatif qu'elle cotise à ce jour à :<br>• La caisse de retraite complémentaire suivante : ${E.klesia_retraite}<br>• La caisse de prévoyance et frais de santé suivante : ${E.klesia_prevoyance}`,
    'Les changements qui pourraient intervenir quant à ces affiliations et leurs conséquences s\'agissant notamment des taux, de l\'assiette des cotisations, du montant des droits ont une nature collective et ne pourront constituer une modification du contrat de travail.',
    `${X} accepte les précomptes de cotisations qui peuvent être effectués à ce titre.`,
    `${X} reconnaît avoir reçu un exemplaire des conditions et garanties attachées à ces contrats de prévoyance et de frais de santé dont le détail figure en annexes du présent contrat.`,
  ]);

  art('Dispositions diverses', [
    `L'accord de ${X} implique formellement qu'${il} n'est lié${e} actuellement à aucune autre entreprise, qu'${il} a quitté son précédent employeur libre de tout engagement et qu'${il} n'est lié${e} par aucune clause de non-concurrence avec un précédent employeur.`,
    `Si ${X} souhaitait exercer une autre activité professionnelle complémentaire non concurrente, ${f ? 'celle-ci' : 'celui-ci'} s'engage à en informer son employeur et à respecter la durée maximale de travail de 48 heures hebdomadaires ou 44 heures sur 12 semaines consécutives.`,
    `${Il} s'engage par ailleurs :<br>- à se conformer aux directives et instructions émanant de la Direction et/ou de son supérieur hiérarchique direct, notamment en matière d'hygiène, de santé et de sécurité au travail ;<br>- à restituer, lors de la suspension de son contrat de travail et au moment de la rupture du contrat, l'intégralité du matériel qui lui a été confié pour un usage exclusivement professionnel.`,
  ]);

  if (loge) {
    art("Mise à disposition d'un logement de fonction à titre onéreux", [
      `• Conditions générales d'attribution du logement :<br>Moyennant le versement d'une indemnité d'occupation, ${X} se voit attribuer, pour la durée de son contrat de travail, un logement meublé dont la société ${E.societe} est locataire, sis ${_ctEsc(emp.logement_adresse || E.logement_defaut)}.`,
      `L'indemnité d'occupation, dont est redevable ${X}, est fixée à ${_ctEuros(+emp.loyer_logement)}€ par mois. Cette indemnité est versée à la société ${E.societe} chaque fin de mois.`,
      `• Évaluation :<br>Cette mise à disposition constitue un avantage en nature accordé en contrepartie de la prestation de travail de ${X}. Etant un élément de salaire, il s'ajoute à sa rémunération et est pris en compte pour le calcul des cotisations sociales et de l'impôt sur le revenu. Pour ce faire, il est évalué d'après le barème forfaitaire.`,
      `• Prise en charge des frais et charges afférents au logement :<br>${X} remboursera à la société ${E.societe} toutes les prestations, taxes locatives et fournitures individuelles incombant habituellement aux occupants ayant souscrit un bail d'habitation.`,
      `• Restitution du logement :<br>Ce logement étant mis à la disposition de ${X} à titre d'accessoire au contrat de travail, ${f ? 'cette dernière' : 'ce dernier'} devra restituer le logement en cas de rupture de son contrat de travail, quelle qu'en soit la cause.`,
      `${X} prend donc l'engagement formel de libérer le logement, dès la cessation effective de son emploi, sans qu'aucune mise en demeure soit nécessaire.`,
    ]);
  }

  art('Informations relatives à la Déclaration Sociale Nominative', [
    `La société ${E.societe} transmet via le dispositif de la déclaration sociale nominative (DSN) toutes les informations sociales nécessaires à l'exercice des droits des salariés.`,
    `Pour garantir la bonne transmission de ces éléments et bénéficier des droits auxquels ${X} pourrait éventuellement prétendre, il est nécessaire que son numéro de Sécurité Sociale et son état civil (nom, prénom, date et lieu de naissance) aient bien été enregistrés par la Caisse d'assurance maladie.`,
    `Le cas échéant, ${X} devra dans les plus brefs délais informer la société ${E.societe} du numéro de Sécurité Sociale définitif qui lui aura été attribué par sa caisse d'assurance maladie.`,
    'La déclaration sociale nominative permet de transmettre de façon dématérialisée les données de rémunération de chacun des salariés ainsi que les données nécessaires à l\'exercice de leurs droits en matière de protection sociale (maladie, retraite, chômage…) figurant actuellement dans des déclarations distinctes destinées à différents organismes et administrations.',
    "Il est précisé que dans le cas des fins de contrats de travail, une attestation de fin de contrat (attestation employeur rematérialisée – AER) est remise au salarié. S'il souhaite faire valoir ses droits éventuels à l'assurance chômage, il devra alors contacter France Travail (par téléphone au 3949 ou par internet www.francetravail.fr).",
    "Les traitements informatiques de la déclaration sociale nominative sont organisés pour préserver et garantir l'intégrité et la sécurité des données à caractère personnel déclarées par l'employeur.",
    `Conformément à la loi « Informatique et libertés », ${X} pourra accéder à ses données à caractère personnel et de rectification de celles-ci, en adressant un courrier à l'organisme ou aux organismes concernés en fonction de la catégorie de données.`,
    `${X} devra indiquer dans le courrier son numéro de sécurité sociale, le ou les employeurs objet de la requête, la ou les durée(s) souhaitée(s) et joindre la photocopie d'un titre d'identité.`,
    'Organismes et services à contacter :',
    "Correspondant « informatique et libertés » de la CNAVTS (Caisse nationale d'assurance vieillesse des travailleurs salariés) ou CCMSA (Caisse centrale de la mutualité agricole) : pour toutes données permettant d'identifier le salarié (nom, prénom, date et lieu de naissance, numéro de sécurité sociale), toutes données relatives à l'emploi ou au contrat de travail et toutes les données relatives à la rémunération.",
    "Directeur de la CPAM (Caisse Primaire d'Assurance Maladie) pour les salariés relevant du régime général ou de la CGSS dans les DOM ou correspondant « informatique et libertés » de la CCMSA (Caisse centrale de la mutualité agricole) pour les salariés relevant du régime agricole : pour toutes données relatives aux dates d'arrêt de travail pour maladie, maternité, paternité ou adoption.",
    "Correspondant « informatique et libertés » de la Direction Générale de France Travail et aux organismes complémentaires (mutuelles, sociétés d'assurance, institutions de prévoyance) : pour les données relatives à la fin du contrat de travail.",
    "Adresses utiles (valables à la date de signature du présent contrat) :<br>CNATVS : à l'attention du service relation CNIL - 110, avenue de Flandres – 75951 PARIS CEDEX 19<br>CCMSA : Les Mercuriales – 40 rue Jean Jaurès – 93547 BAGNOLET CEDEX<br>France Travail (Direction Générale) : 1, avenue du Docteur Gley – 75020 PARIS",
    `Pour toutes autres données non relatives à la DSN, ${X} devra se reporter aux conditions précisées sur le site de la CNIL (www.cnil.fr).`,
  ]);

  const adresse = _ctEsc(emp.adresse).replace(/\n/g, '<br>');
  const naissance = `${f ? 'Née' : 'Né'} le ${_ctDateLong(emp.date_naissance)} à ${_ctEsc(emp.lieu_naissance)}`;
  const corps = articles.map((a, i) => `<h2>ARTICLE N°${_ctRoman(i + 1)} – ${_ctEsc(a.titre)}</h2>` +
    a.paras.filter(Boolean).map(p => `<p>${p}</p>`).join('')).join('');

  const contrat = `
  <section class="contrat-page cs">
    <header class="contrat-header"><h1>${titre}</h1></header>
    <p>Entre les soussignés :</p>
    <p class="bloc">La Société ${E.societe}<br>${E.adresse}<br>${E.cp_ville}<br>SIRET N° : ${E.siret}<br>Code APE : ${E.ape}<br>
      Agissant par l'intermédiaire de son représentant légal ${E.representant}, en qualité de ${E.qualite}.<br>
      Les cotisations de sécurité sociale sont versées sous le numéro ${E.urssaf} à l'URSSAF d'Aquitaine.</p>
    <p class="cs-part">D'UNE PART</p>
    <p>Et :</p>
    <p class="bloc">${X}<br>${adresse}<br>${naissance}<br>Nationalité : ${_ctEsc(emp.nationalite || 'Française')}<br>N° de sécurité sociale : ${_ctEsc(emp.num_secu)}</p>
    <p class="cs-part">D'AUTRE PART</p>
    <p><b>IL A ETE CONVENU ET ARRETE CE QUI SUIT :</b></p>
    ${corps}
    <p class="fait-en-deux">Fait à BIGANOS<br>Le ……………………………<br>En trois exemplaires dont un remis à ${leSal}<br>Signatures précédées de la mention manuscrite « Lu et approuvé »</p>
    <div class="sign-block">
      <div class="sign-col"><div class="sign-label">${f ? 'Mme' : 'M.'} ${_ctEsc(String(emp.nom).toUpperCase())} ${_ctEsc(emp.prenom)}</div><div class="sign-sub">${f ? 'Salariée' : 'Salarié'}</div><div class="sign-box"></div></div>
      <div class="sign-col"><div class="sign-label">${E.representant}</div><div class="sign-sub">${E.qualite}</div><div class="sign-box"></div></div>
    </div>
  </section>`;

  return contrat + _ctAnnexeRgpd(f) + _ctAccusePrevoyance(X, f);
}

function _ctAnnexeRgpd(f) {
  const sal = f ? 'la salariée' : 'le salarié';
  return `
  <section class="contrat-page cs">
    <header class="contrat-header"><h1>ANNEXE<br>Protection des données</h1></header>
    <p>Vos données personnelles font l'objet d'un traitement automatisé par notre entreprise.</p>
    <p>Le traitement de vos données personnelles a pour finalité :<br>• la gestion administrative du personnel (identification du salarié et gestion de la paie, dossier disciplinaire, remboursement des frais professionnels),<br>• la formation et l'évaluation du personnel,<br>• la mise à disposition d'outils informatiques et l'organisation du travail,<br>tout en répondant aux obligations légales et réglementaires ainsi qu'à l'exercice des prérogatives reconnues à l'entreprise par la loi et la jurisprudence.</p>
    <p>Les catégories de données traitées pour la réalisation des finalités indiquées ci-dessus sont les suivantes :</p>
    <p><b>a) identification de l'employé et gestion de la paie :</b><br>• identité : nom, prénom, sexe, date et lieu de naissance, nationalité, coordonnées professionnelles, coordonnées personnelles, matricule interne, références du passeport (uniquement pour les personnels amenés à se déplacer à l'étranger) ;<br>• Type, numéro d'ordre et copie du titre valant autorisation de travail pour les employés étrangers en application du 8° de l'article D 1221-23 du code du travail ;<br>• le cas échéant, coordonnées des personnes à prévenir en cas d'urgence ;<br>• le NIR (numéro d'inscription au répertoire) ou numéro de sécurité sociale ;<br>• les coordonnées bancaires pour vous verser votre salaire ;<br>• Situation matrimoniale et nombre d'enfants à charge pour l'inscription aux régimes de prévoyance et de frais de santé.</p>
    <p>Précision : Les données relatives à la paie sont notamment collectées pour leur utilisation par les organismes tiers tels l'URSSAF, les caisses de retraite complémentaire (KLESIA Retraite ARRCO (ex-CGIS)), de frais de santé et de prévoyance (KLESIA Prévoyance (ex-IPGM, ex-APGME)), le Cabinet ECE LOT ET GARONNE auquel a été sous-traitée la paie, pour l'exécution de tâches nécessaires à la gestion de votre contrat de travail.</p>
    <p><b>b) gestion administrative de l'employé :</b><br>• gestion de la carrière de l'employé : date et conditions d'embauche ou de recrutement, date, objet et motif des modifications apportées à la situation professionnelle de l'employé, simulation de carrière, desiderata de l'employé en termes d'emploi, sanctions disciplinaires à l'exclusion de celles consécutives à des faits amnistiés ;<br>• gestion des déclarations d'accident du travail et de maladie professionnelle : coordonnées du médecin du travail, date de l'accident ou de la première constatation médicale de la maladie professionnelle, date du dernier jour de travail, date de reprise, motif de l'arrêt (accident du travail ou maladie professionnelle), travail non repris à ce jour ;<br>• suivi administratif des visites médicales des employés : dates des visites, aptitude au poste de travail (apte ou inapte, propositions d'adaptation du poste de travail ou d'affectation à un autre poste de travail formulées par le médecin du travail) ;<br>• type de permis de conduire détenu par l'employé ;<br>• sujétions particulières ouvrant droit à congés spéciaux ou à un crédit d'heures de délégation (telles que l'exercice d'un mandat électif ou représentatif syndical, la participation à la réserve opérationnelle ou aux missions de sapeur-pompier volontaire) ;</p>
    <p><b>c) formation et évaluation du personnel :</b><br>• évaluation professionnelle de l'employé : dates des entretiens d'évaluation, identité de l'évaluateur, compétences professionnelles de l'employé, objectifs assignés, résultats obtenus, appréciation des aptitudes professionnelles sur la base de critères objectifs et présentant un lien direct et nécessaire avec l'emploi occupé, observations et souhaits formulés par l'employé, prévisions d'évolution de carrière ;<br>• validation des acquis de l'expérience : date de la demande de validation, diplôme, titre ou certificat de qualification concerné, expériences professionnelles soumises à validation, validation (oui/non), date de la décision ;<br>• formation : diplômes, certificats et attestations, langues étrangères pratiquées, suivi des demandes de formation professionnelle et des périodes de formation effectuées, organisation des sessions de formation, évaluation des connaissances et des formations ;</p>
    <p><b>d) mise à disposition d'outils informatiques et organisation du travail :</b><br>• annuaires internes et organigrammes : nom, prénom, photographie (facultatif), fonction, coordonnées professionnelles, le cas échéant, formation et réalisations professionnelles ;<br>• agendas professionnels : dates, lieux et heures des rendez-vous professionnels, objet, personnes présentes ;<br>• tâches des personnels : identification des personnels concernés, répartition des tâches ;<br>• gestion des dotations individuelles en fournitures, équipements, véhicules et cartes de paiement : gestion des demandes, nature de la dotation, dates de dotation, de maintenance et de retrait, affectations budgétaires ;<br>• annuaires informatiques permettant de définir les autorisations d'accès aux applications et aux réseaux ;<br>• données de connexion enregistrées pour assurer la sécurité et le bon fonctionnement des applications et des réseaux informatiques, à l'exclusion de tout traitement permettant le contrôle individuel de l'activité des employés ;<br>• messagerie électronique et téléphone portable : carnet d'adresses, comptes individuels, à l'exclusion de toute donnée relative au contrôle des communications électroniques individuelles émises ou reçues par les employés et énoncées comme telles ;<br>• réseaux privés virtuels de diffusion ou de collecte de données de gestion administrative des personnels (intranet) : formulaires administratifs internes, organigrammes, espaces de discussion, espaces d'information ;</p>
    <p>La fourniture de ces données à caractère personnel est placée sous le respect des obligations propres au domaine de l'emploi.</p>
    <p>Nous vous informons que les données vous concernant seront traitées de façon confidentielle, y compris celles traitées par des prestataires de service.</p>
    <p>Vos données ne sont pas conservées par les services gestionnaires au-delà de la période de trois ans pour les données du dossier disciplinaire, et de cinq ans après la rupture du contrat de travail, sans préjudice de dispositions législatives ou réglementaires propres à certaines catégories de données imposant une durée de conservation particulière ou la suppression de ces données (cf. tableau ci-dessous).</p>
    <p>Au-delà, ces données peuvent être archivées sur un support informatique distinct et à accès très limité, conformément aux règles applicables en matière d'archives publiques et d'archives privées.</p>
    <p>Vos données ne font et ne feront pas l'objet d'un transfert en dehors de l'Union européenne.</p>
    <p>Seules les personnes habilitées chargées de la gestion du personnel, les supérieurs hiérarchiques des employés concernés, les institutions représentatives du personnel, pourront accéder à vos données à des fins strictement internes.</p>
    <p>Conformément aux dispositions légales et réglementaires applicables, vous bénéficiez d'un droit d'accès, de rectification et d'effacement de vos données ou encore de limitation du traitement. Vous pouvez, sous réserve de la production d'un justificatif d'identité valide, exercer vos droits en contactant le service …………………………………… par mail : ……………………………@…………………… ou par courrier envoyé à l'attention de ……………………………………, à l'adresse suivante : ………………………………………………………………………….</p>
    <p>En cas de difficulté en lien avec la gestion de vos données personnelles, vous pouvez contacter la Commission nationale de l'informatique et des libertés (plus d'informations sur www.cnil.fr).</p>
    <h2>Durée de conservation des données</h2>
    <p>Gestion du personnel : 5 ans (en archivage intermédiaire) à compter du départ du salarié. Archivage intermédiaire : données qui ne sont plus utilisées mais qui présentent encore un intérêt administratif pour l'organisme.<br>
    Gestion de la paie : 5 ans à compter du versement de la paie.<br>
    Gestion des réunions des instances représentatives du personnel : les données relatives aux sujétions particulières ouvrant droit aux congés spéciaux ou à un crédit d'heures de délégation ne sont pas conservées au-delà de la période de sujétion de l'employé concerné.<br>
    Mandats des représentants du personnel - nature du mandat et syndicat d'appartenance : 6 mois après la fin du mandat.<br>
    Gestion de l'annuaire du personnel : les données ne sont pas conservées au-delà de la période d'emploi de la personne concernée.<br>
    Gestion de l'utilisation d'Internet par les salariés : 6 mois concernant l'historique des connexions.<br>
    Gestion de la téléphonie (données relatives à l'utilisation des services de téléphone : numéros appelés, numéros des appels entrants, etc.) : 1 an.<br>
    Autocommutateur : détail des appels téléphoniques : 6 mois glissants.<br>
    Gestion des arrêts maladie : conservation des données relatives aux motifs d'absence : 5 ans.<br>
    Contrôles d'accès : les éléments d'identification ne doivent pas être conservés au-delà du temps pendant lequel la personne est habilitée à pénétrer dans les locaux concernés ; 3 mois (historique des passages).<br>
    Sanctions disciplinaires : 3 ans glissants (sauf amnistie).<br>
    (Durée de conservation indiquée sauf en prévision d'un éventuel contentieux jusqu'à la prescription de l'action en question)</p>
    <p class="fait-en-deux">Fait à BIGANOS, le …………………….<br>Nom et signature de ${sal}<br>Précédés de la mention manuscrite, « reçu en main propre, le ……………………. »</p>
    <div class="sign-box"></div>
  </section>`;
}

function _ctAccusePrevoyance(X, f) {
  const E = EMPLOYEUR_CONTRAT;
  return `
  <section class="contrat-page cs">
    <header class="contrat-header"><h1>IMPORTANT<br>A COMPLETER ET A REMETTRE A VOTRE EMPLOYEUR</h1></header>
    <p><b>Accusé de réception notices d'information garanties de prévoyance et bulletins d'affiliation.</b></p>
    <p>Je soussigné${f ? 'e' : ''}, ${X}, reconnais :</p>
    <p>- avoir reçu une notice d'information sur les garanties prévoyance (et une notice d'information sur le régime frais de santé ainsi que le(s) bulletin(s) d'affiliation afférent(s). Je m'engage à renvoyer ce(s) bulletin(s) dument complété(s) et signé(s), dans les meilleurs délais.</p>
    <p>Le défaut de réception du (des) bulletin(s) d'affiliation dument complété(s) et signé(s) par le salarié ne permet pas au salarié de bénéficier des garanties souscrites auprès desdits organismes.</p>
    <p>Notre entreprise :<br>SAS ${E.societe}<br>${E.adresse}<br>${E.cp_ville}<br>a souscrit cette (ces) garantie(s) auprès de l'(des) institution(s) suivante(s) :<br>
    • pour les garanties de prévoyances : ${E.klesia_prevoyance} ;<br>• pour les garanties frais de santé : ${E.klesia_prevoyance} ;<br>
    dans le cadre du régime des prévoyances de l'ensemble du personnel relevant de la Convention Collective des Hôtels, cafés, restaurants.</p>
    <p>➢ Si vous souhaitez faire valoir un cas de dispense merci d'en préciser la nature et de transmettre le justificatif à la Direction, à défaut la cotisation sera prélevée :</p>
    <p>_________________________________________________________________________________</p>
    <p class="fait-en-deux">A BIGANOS<br>Le ………………………………<br>Signature</p>
    <div class="sign-box"></div>
  </section>`;
}

// Ouvre le contrat dans une fenêtre déjà ouverte (ouverte au clic pour éviter le bloqueur de popups).
function ouvrirContratSalarie(w, emp, scheds) {
  const css = _contratPrintCss() + `
    .cs .contrat-header h1 { font-size:14pt; line-height:1.4; }
    .cs h2 { font-size:11pt; border-bottom:none; margin-top:14px; }
    .cs .bloc { margin:4px 0 4px 0; }
    .cs .cs-part { text-align:right; font-weight:700; margin:6px 0 12px; }`;
  const titre = `Contrat ${emp.type_contrat} ${String(emp.nom).toUpperCase()} ${emp.prenom}`;
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_ctEsc(titre)}</title><style>${css}</style></head><body>
    <div class="toolbar"><button onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button><span class="toolbar-hint">Dans la boîte d'impression, décochez<br><b>« En-têtes et pieds de page »</b></span></div>
    ${contratSalarieHtml(emp, scheds)}
  </body></html>`);
  w.document.close();
}
