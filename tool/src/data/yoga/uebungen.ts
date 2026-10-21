// Übungskatalog für den Yoga-Flow (Hatha: Haltungen etwas länger halten).
// Fotos: Wikimedia Commons, freie Lizenzen (CC0/PD, CC BY, CC BY-SA); Nachweis je Foto in `quelle`,
// angezeigt unter „Bildnachweise“. Die Dateien liegen in public/yoga/ (auf 720 px verkleinert, WebP).
import type { YogaUebung } from '../../types';

export const UEBUNGEN: YogaUebung[] = [
  {
    "id": "sukhasana",
    "block": "Ankommen",
    "name": "Leichter Sitz",
    "sanskrit": "Sukhasana",
    "sekunden": 120,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Bequem im Schneidersitz, Sitzknochen erden, Wirbelsäule lang. Augen schließen und den Atem beobachten, ohne ihn zu verändern.",
    "bild": "yoga/sukhasana.webp",
    "quelle": {
      "urheber": "Joseph RENGER",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "http://creativecommons.org/licenses/by-sa/3.0/",
      "seite": "https://commons.wikimedia.org/wiki/File:Sukkasana.jpg"
    }
  },
  {
    "id": "balasana",
    "block": "Ankommen",
    "name": "Kindhaltung",
    "sanskrit": "Balasana",
    "sekunden": 90,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Knie hüftbreit, Gesäß Richtung Fersen, Stirn ablegen. Arme lang nach vorn oder neben den Körper. In den Rücken atmen.",
    "bild": "yoga/balasana.webp",
    "quelle": {
      "urheber": "Iveto",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Balasana.JPG"
    }
  },
  {
    "id": "supta-baddha-konasana",
    "block": "Ankommen",
    "name": "Liegender Schmetterling",
    "sanskrit": "Supta Baddha Konasana",
    "sekunden": 120,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Auf dem Rücken liegen, Fußsohlen zusammen, Knie sinken zur Seite. Eine Hand auf Bauch, eine aufs Herz. Weich werden.",
    "bild": "yoga/supta-baddha-konasana.webp",
    "quelle": {
      "urheber": "Trollderella",
      "lizenz": "CC BY-SA 2.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/2.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Supta_baddha_konasana_variation.jpg"
    }
  },
  {
    "id": "katze-kuh",
    "block": "Mobilisieren",
    "name": "Katze und Kuh",
    "sanskrit": "Marjaryasana / Bitilasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Im Vierfüßlerstand: einatmend Brust nach vorn, Blick leicht hoch; ausatmend Rücken runden, Kinn zur Brust. Langsam, im Atemrhythmus.",
    "bild": "yoga/katze-kuh.webp",
    "quelle": {
      "urheber": "Mary O'Neill",
      "lizenz": "Public domain",
      "lizenzUrl": "",
      "seite": "https://commons.wikimedia.org/wiki/File:Yoga_at_Your_Park_-_Bitilasana.jpg"
    }
  },
  {
    "id": "seitbeuge",
    "block": "Mobilisieren",
    "name": "Stehende Seitbeuge",
    "sanskrit": "Indudalasana",
    "sekunden": 30,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Füße zusammen, Arme über den Kopf, Hände verschränken. Mit dem Ausatmen zur Seite neigen, beide Fußsohlen bleiben schwer, Brust weit.",
    "bild": "yoga/seitbeuge-sitz.webp",
    "quelle": {
      "urheber": "Mr. Yoga",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Mr-yoga-side_bend.jpg"
    }
  },
  {
    "id": "apanasana",
    "block": "Mobilisieren",
    "name": "Knie zur Brust",
    "sanskrit": "Apanasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": false,
    "anleitung": "In Rückenlage beide Knie zur Brust ziehen, Kreuzbein schwer. Mit dem Ausatmen die Knie etwas näher holen, kleine Kreise erlaubt.",
    "bild": "yoga/apanasana.webp",
    "quelle": {
      "urheber": "Thamizhpparithi Maari",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:A_style_of_pavanamuktasana_1.JPG"
    }
  },
  {
    "id": "vogel-hund",
    "block": "Mobilisieren",
    "name": "Vogel-Hund",
    "sanskrit": "Parsva Bharmanasana",
    "sekunden": 30,
    "beidseitig": true,
    "standard": false,
    "anleitung": "Im Vierfüßlerstand den rechten Arm und das linke Bein lang strecken, Becken bleibt gerade. Bauch fest, ruhig atmen.",
    "bild": "yoga/vogel-hund.webp",
    "quelle": {
      "urheber": "PTPioneer",
      "lizenz": "CC BY 2.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/2.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Girl_doing_bird_dog_yoga_pose.jpg"
    }
  },
  {
    "id": "tadasana",
    "block": "Erwärmen",
    "name": "Berghaltung",
    "sanskrit": "Tadasana",
    "sekunden": 45,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Füße hüftbreit, Gewicht gleichmäßig. Knie weich, Steißbein lang, Scheitel zieht nach oben. Schultern sinken.",
    "bild": "yoga/tadasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Tadasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "adho-mukha-svanasana",
    "block": "Erwärmen",
    "name": "Herabschauender Hund",
    "sanskrit": "Adho Mukha Svanasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Hände schulterbreit, Gesäß nach hinten oben. Rücken lang, Knie dürfen gebeugt sein. Fersen sinken Richtung Boden.",
    "bild": "yoga/adho-mukha-svanasana.webp",
    "quelle": {
      "urheber": "Iveto",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Downward-Facing-Dog.JPG"
    }
  },
  {
    "id": "utkatasana",
    "block": "Erwärmen",
    "name": "Stuhlhaltung",
    "sanskrit": "Utkatasana",
    "sekunden": 30,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Knie beugen, als würdest du dich auf einen Stuhl setzen. Arme nach oben, Gewicht in den Fersen, Oberkörper lang.",
    "bild": "yoga/utkatasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Utkatasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "anjaneyasana",
    "block": "Erwärmen",
    "name": "Tiefer Ausfallschritt",
    "sanskrit": "Anjaneyasana",
    "sekunden": 45,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Vorderes Knie über dem Knöchel, hinteres Knie abgelegt. Becken sinkt nach vorn unten, Arme nach oben, Brust weit.",
    "bild": "yoga/anjaneyasana.webp",
    "quelle": {
      "urheber": "Julija Zora Mazover",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:%C4%80%C3%B1janey%C4%81sana,_Julija_Zora_Mazover,_2023.jpg"
    }
  },
  {
    "id": "phalakasana",
    "block": "Erwärmen",
    "name": "Brett",
    "sanskrit": "Phalakasana",
    "sekunden": 30,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Hände unter den Schultern, Körper eine Linie von Kopf bis Ferse. Bauch fest, Nacken lang. Knie dürfen abgelegt werden.",
    "bild": "yoga/phalakasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Chaturanga-Dandasana_high_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "virabhadrasana-1",
    "block": "Stehhaltungen",
    "name": "Krieger I",
    "sanskrit": "Virabhadrasana I",
    "sekunden": 45,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Großer Schritt, vorderes Knie gebeugt, hintere Ferse schräg am Boden. Becken nach vorn ausrichten, Arme nach oben.",
    "bild": "yoga/virabhadrasana-1.webp",
    "quelle": {
      "urheber": "OrenBochman",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Virabhadrasana_I_-_Warrior_Pose_I.jpg"
    }
  },
  {
    "id": "virabhadrasana-2",
    "block": "Stehhaltungen",
    "name": "Krieger II",
    "sanskrit": "Virabhadrasana II",
    "sekunden": 45,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Weiter Stand, vorderes Knie über dem Knöchel, Becken zur Seite geöffnet. Arme auf Schulterhöhe, Blick über die vordere Hand.",
    "bild": "yoga/virabhadrasana-2.webp",
    "quelle": {
      "urheber": "lululemon athletica",
      "lizenz": "CC BY 2.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/2.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Yoga_Warrior_I.jpg"
    }
  },
  {
    "id": "trikonasana",
    "block": "Stehhaltungen",
    "name": "Dreieck",
    "sanskrit": "Utthita Trikonasana",
    "sekunden": 45,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Beine gestreckt im weiten Stand, Oberkörper seitlich über das vordere Bein. Untere Hand am Schienbein, obere zur Decke.",
    "bild": "yoga/trikonasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Trikonasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "parsvakonasana",
    "block": "Stehhaltungen",
    "name": "Seitwinkel",
    "sanskrit": "Utthita Parsvakonasana",
    "sekunden": 45,
    "beidseitig": true,
    "standard": false,
    "anleitung": "Aus Krieger II den Unterarm auf den vorderen Oberschenkel legen, oberer Arm schräg über das Ohr. Eine lange Linie vom Fuß bis zur Hand.",
    "bild": "yoga/parsvakonasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Utthita-Parshvakonasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "prasarita",
    "block": "Stehhaltungen",
    "name": "Grätschvorbeuge",
    "sanskrit": "Prasarita Padottanasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Weiter Stand, Füße parallel. Mit langem Rücken nach vorn beugen, Hände auf den Boden oder Blöcke, Kopf hängt.",
    "bild": "yoga/prasarita.webp",
    "quelle": {
      "urheber": "Nicholas A. Tonelli from Northeast Pennsylvania, USA",
      "lizenz": "CC BY 2.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/2.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Forward_(15286103544).jpg"
    }
  },
  {
    "id": "parsvottanasana",
    "block": "Stehhaltungen",
    "name": "Pyramide",
    "sanskrit": "Parsvottanasana",
    "sekunden": 45,
    "beidseitig": true,
    "standard": false,
    "anleitung": "Kurzer Schritt, beide Beine gestreckt, Becken nach vorn. Mit langem Rücken über das vordere Bein beugen.",
    "bild": "yoga/parsvottanasana.webp",
    "quelle": {
      "urheber": "Joseph RENGER",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "http://creativecommons.org/licenses/by-sa/3.0/",
      "seite": "https://commons.wikimedia.org/wiki/File:Parshvottanasana.jpg"
    }
  },
  {
    "id": "vrksasana",
    "block": "Gleichgewicht",
    "name": "Baum",
    "sanskrit": "Vrksasana",
    "sekunden": 45,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Gewicht auf ein Bein, den anderen Fuß an Wade oder Oberschenkel (nicht ans Knie). Hände vor der Brust oder nach oben, Blick ruhig auf einen Punkt.",
    "bild": "yoga/vrksasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Vriksasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "virabhadrasana-3",
    "block": "Gleichgewicht",
    "name": "Krieger III",
    "sanskrit": "Virabhadrasana III",
    "sekunden": 30,
    "beidseitig": true,
    "standard": false,
    "anleitung": "Oberkörper und hinteres Bein bilden eine Linie parallel zum Boden. Hüften bleiben auf einer Höhe, Arme nach vorn oder an die Seiten.",
    "bild": "yoga/virabhadrasana-3.webp",
    "quelle": {
      "urheber": "Robert Lindermayr",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Tuladandasana_-_Virabhadrasana_III_(cropped).jpg"
    }
  },
  {
    "id": "natarajasana",
    "block": "Gleichgewicht",
    "name": "Tänzer",
    "sanskrit": "Natarajasana",
    "sekunden": 30,
    "beidseitig": true,
    "standard": false,
    "anleitung": "Fuß hinten greifen, Knie zeigt nach unten. Den Fuß in die Hand drücken und den Oberkörper leicht nach vorn neigen, freier Arm nach vorn.",
    "bild": "yoga/natarajasana.webp",
    "quelle": {
      "urheber": "Mr. Yoga",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Mr-yoga-lord_of_dance_5.jpg"
    }
  },
  {
    "id": "garudasana",
    "block": "Gleichgewicht",
    "name": "Adler",
    "sanskrit": "Garudasana",
    "sekunden": 30,
    "beidseitig": true,
    "standard": false,
    "anleitung": "Knie beugen, ein Bein über das andere schlagen, Arme ebenso umeinander wickeln. Ellbogen heben, tief sitzen.",
    "bild": "yoga/garudasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Garudasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "salamba-bhujangasana",
    "block": "Rückbeugen",
    "name": "Sphinx",
    "sanskrit": "Salamba Bhujangasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": true,
    "anleitung": "In Bauchlage auf die Unterarme stützen, Ellbogen unter den Schultern. Brust nach vorn ziehen, Schultern weg von den Ohren.",
    "bild": "yoga/salamba-bhujangasana.webp",
    "quelle": {
      "urheber": "Marcocarvalho",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Ardha_bhujangasana.jpg"
    }
  },
  {
    "id": "bhujangasana",
    "block": "Rückbeugen",
    "name": "Kobra",
    "sanskrit": "Bhujangasana",
    "sekunden": 30,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Hände neben der Brust, Ellbogen nah am Körper. Brust mit der Kraft des Rückens heben, Schambein bleibt am Boden.",
    "bild": "yoga/bhujangasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Bhujangasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "salabhasana",
    "block": "Rückbeugen",
    "name": "Heuschrecke",
    "sanskrit": "Salabhasana",
    "sekunden": 30,
    "beidseitig": false,
    "standard": false,
    "anleitung": "In Bauchlage Brust, Arme und Beine gleichzeitig vom Boden heben. Nacken lang, Blick zum Boden.",
    "bild": "yoga/salabhasana.webp",
    "quelle": {
      "urheber": "Nikiwiki242",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Salabhasana_(cropped).jpg"
    }
  },
  {
    "id": "dhanurasana",
    "block": "Rückbeugen",
    "name": "Bogen",
    "sanskrit": "Dhanurasana",
    "sekunden": 30,
    "beidseitig": false,
    "standard": false,
    "anleitung": "In Bauchlage die Fußgelenke greifen, Füße in die Hände drücken und Brust und Knie heben. Gleichmäßig weiteratmen.",
    "bild": "yoga/dhanurasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Dhanurasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "setu-bandha",
    "block": "Rückbeugen",
    "name": "Brücke",
    "sanskrit": "Setu Bandha Sarvangasana",
    "sekunden": 45,
    "beidseitig": false,
    "standard": true,
    "anleitung": "In Rückenlage Füße aufstellen, Becken heben. Knie zeigen nach vorn, Hände unter dem Rücken verschränken oder neben dem Körper.",
    "bild": "yoga/setu-bandha.webp",
    "quelle": {
      "urheber": "Biswarup Ganguly",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Setubandhasana_oblique_view.JPG"
    }
  },
  {
    "id": "ustrasana",
    "block": "Rückbeugen",
    "name": "Kamel",
    "sanskrit": "Ustrasana",
    "sekunden": 30,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Im Kniestand Hände ins Kreuz, Becken nach vorn, Brust nach oben öffnen. Wer mag, greift die Fersen. Kopf nur so weit nach hinten, wie es angenehm ist.",
    "bild": "yoga/ustrasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Ustrasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "matsyasana",
    "block": "Rückbeugen",
    "name": "Fisch",
    "sanskrit": "Matsyasana",
    "sekunden": 45,
    "beidseitig": false,
    "standard": false,
    "anleitung": "In Rückenlage auf die Unterarme stützen, Brust heben und den Scheitel sanft ablegen. Beine bleiben aktiv und lang.",
    "bild": "yoga/matsyasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Matsyasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "malasana",
    "block": "Hüftöffner",
    "name": "Girlande",
    "sanskrit": "Malasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Tiefe Hocke, Füße etwas weiter als hüftbreit. Hände vor der Brust, Ellbogen schieben die Knie sanft auseinander.",
    "bild": "yoga/malasana.webp",
    "quelle": {
      "urheber": "robzabelyoga.com",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Upave%C5%9B%C4%81sana.jpg"
    }
  },
  {
    "id": "taube",
    "block": "Hüftöffner",
    "name": "Taube",
    "sanskrit": "Eka Pada Rajakapotasana (Vorstufe)",
    "sekunden": 90,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Ein Knie hinter die gleichseitige Hand, das andere Bein lang nach hinten. Becken gerade, nach vorn ablegen und in die Hüfte atmen.",
    "bild": "yoga/taube.webp",
    "quelle": {
      "urheber": "Christy Collins, photographer",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:IMG_0585_2--_Swan.jpg"
    }
  },
  {
    "id": "ananda-balasana",
    "block": "Hüftöffner",
    "name": "Glückliches Baby",
    "sanskrit": "Ananda Balasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": false,
    "anleitung": "In Rückenlage die Füße außen greifen, Knie neben den Brustkorb. Kreuzbein bleibt schwer, sanft hin und her schaukeln.",
    "bild": "yoga/ananda-balasana.webp",
    "quelle": {
      "urheber": "Christy Collins, photographer",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:IMG_0377_2_Happy_Baby.jpg"
    }
  },
  {
    "id": "uttanasana",
    "block": "Vorbeugen",
    "name": "Stehende Vorbeuge",
    "sanskrit": "Uttanasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Aus der Hüfte nach vorn beugen, Knie gern gebeugt. Oberkörper hängt, Kopf und Nacken lassen los.",
    "bild": "yoga/uttanasana.webp",
    "quelle": {
      "urheber": "Joseph RENGER",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "http://creativecommons.org/licenses/by-sa/3.0/",
      "seite": "https://commons.wikimedia.org/wiki/File:3Uttanasana.JPG"
    }
  },
  {
    "id": "paschimottanasana",
    "block": "Vorbeugen",
    "name": "Sitzende Vorbeuge",
    "sanskrit": "Paschimottanasana",
    "sekunden": 90,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Beine lang nach vorn, mit langem Rücken aus der Hüfte nach vorn neigen. Hände dort ablegen, wo sie hinkommen. Mit jedem Ausatmen nachgeben.",
    "bild": "yoga/paschimottanasana.webp",
    "quelle": {
      "urheber": "Robert Lindermayr",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Pashchimottanasana_Heinz_Grill.jpg"
    }
  },
  {
    "id": "janu-sirsasana",
    "block": "Vorbeugen",
    "name": "Kopf zum Knie",
    "sanskrit": "Janu Sirsasana",
    "sekunden": 60,
    "beidseitig": true,
    "standard": false,
    "anleitung": "Ein Bein lang, die Fußsohle des anderen innen an den Oberschenkel. Bauchnabel zum gestreckten Bein drehen und nach vorn beugen.",
    "bild": "yoga/janu-sirsasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Janusirsasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "baddha-konasana",
    "block": "Vorbeugen",
    "name": "Schmetterling",
    "sanskrit": "Baddha Konasana",
    "sekunden": 90,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Fußsohlen zusammen, Knie sinken nach außen. Füße umfassen, aufrecht sitzen oder mit langem Rücken nach vorn neigen.",
    "bild": "yoga/baddha-konasana.webp",
    "quelle": {
      "urheber": "Jfbongarçon",
      "lizenz": "CC BY-SA 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Baddha_Ko%E1%B9%87%C4%81sana-bound_angle.jpg"
    }
  },
  {
    "id": "upavistha-konasana",
    "block": "Vorbeugen",
    "name": "Sitzende Grätsche",
    "sanskrit": "Upavistha Konasana",
    "sekunden": 90,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Beine weit gegrätscht, Zehen zeigen nach oben. Hände nach vorn wandern lassen, Rücken bleibt lang.",
    "bild": "yoga/upavistha-konasana.webp",
    "quelle": {
      "urheber": "lululemon athletica",
      "lizenz": "CC BY 2.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/2.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Yoga_Split_2.jpg"
    }
  },
  {
    "id": "ardha-matsyendrasana",
    "block": "Drehungen",
    "name": "Drehsitz",
    "sanskrit": "Ardha Matsyendrasana",
    "sekunden": 45,
    "beidseitig": true,
    "standard": true,
    "anleitung": "Ein Bein angewinkelt über das andere stellen, mit dem Einatmen aufrichten, mit dem Ausatmen zur Seite des aufgestellten Knies drehen.",
    "bild": "yoga/ardha-matsyendrasana.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Ardha-Matsyendrasana_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "supta-matsyendrasana",
    "block": "Drehungen",
    "name": "Liegende Drehung",
    "sanskrit": "Supta Matsyendrasana",
    "sekunden": 60,
    "beidseitig": true,
    "standard": true,
    "anleitung": "In Rückenlage die Knie zu einer Seite sinken lassen, Arme ausgebreitet, Blick zur anderen Seite. Schultern bleiben schwer.",
    "bild": "yoga/supta-matsyendrasana.webp",
    "quelle": {
      "urheber": "Mr. Yoga",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Mr-yoga-svastika-legs-twist.jpg"
    }
  },
  {
    "id": "viparita-karani",
    "block": "Umkehrhaltungen",
    "name": "Umkehrhaltung",
    "sanskrit": "Viparita Karani",
    "sekunden": 120,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Becken mit den Händen stützen, Beine Richtung Decke, Nacken frei. Sanfte Variante: Gesäß nah an die Wand, Beine an der Wand hoch.",
    "bild": "yoga/viparita-karani.webp",
    "quelle": {
      "urheber": "Kennguru",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Viparita-Karani_Yoga-Asana_Nina-Mel.jpg"
    }
  },
  {
    "id": "sarvangasana",
    "block": "Umkehrhaltungen",
    "name": "Schulterstand",
    "sanskrit": "Salamba Sarvangasana",
    "sekunden": 60,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Aus der Rückenlage Beine und Becken heben, Hände stützen den Rücken. Gewicht auf den Schultern, nicht auf dem Nacken. Bei Nackenbeschwerden auslassen.",
    "bild": "yoga/sarvangasana.webp",
    "quelle": {
      "urheber": "Robin Lambrecht",
      "lizenz": "CC BY-SA 4.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by-sa/4.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Sarvangasana,_Julija_Zora_Mazover,_2022.jpg"
    }
  },
  {
    "id": "halasana",
    "block": "Umkehrhaltungen",
    "name": "Pflug",
    "sanskrit": "Halasana",
    "sekunden": 45,
    "beidseitig": false,
    "standard": false,
    "anleitung": "Aus dem Schulterstand die Füße hinter dem Kopf Richtung Boden sinken lassen. Nacken frei, nur so weit wie es angenehm ist.",
    "bild": "yoga/halasana.webp",
    "quelle": {
      "urheber": "Marcocarvalho",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Raja_halasana.jpg"
    }
  },
  {
    "id": "savasana",
    "block": "Entspannung",
    "name": "Endentspannung",
    "sanskrit": "Savasana",
    "sekunden": 300,
    "beidseitig": false,
    "standard": true,
    "anleitung": "Auf dem Rücken liegen, Beine und Arme locker, Handflächen nach oben. Den Körper schwer werden lassen und nichts mehr tun.",
    "bild": "yoga/savasana.webp",
    "quelle": {
      "urheber": "Marcocarvalho",
      "lizenz": "CC BY 3.0",
      "lizenzUrl": "https://creativecommons.org/licenses/by/3.0",
      "seite": "https://commons.wikimedia.org/wiki/File:Udara_shavasana_1.jpg"
    }
  }
];
