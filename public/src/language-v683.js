(function(){
  'use strict';

  const STORAGE_KEY='ml_app_language_v683';
  const SUPPORTED=new Set(['en','gu','hi']);
  const LANGUAGE_META={
    en:{name:'English',nativeName:'English',short:'EN',locale:'en-IN'},
    gu:{name:'Gujarati',nativeName:'ગુજરાતી',short:'ગુ',locale:'gu-IN'},
    hi:{name:'Hindi',nativeName:'हिन्दी',short:'हि',locale:'hi-IN'}
  };

  const GU={
    'Language':'ભાષા','Choose App Language':'Appની ભાષા પસંદ કરો','Select the language used for menus, buttons and messages.':'Menu, button અને message માટેની ભાષા પસંદ કરો.','Your saved business data will not be changed.':'તમારો સાચવેલો business data બદલાશે નહીં.','Current language':'હાલની ભાષા','Selected':'પસંદ કરેલ','Close':'બંધ કરો',
    'Dashboard':'ડેશબોર્ડ','Trip History':'ટ્રિપ હિસ્ટ્રી','Invoice History':'ઇન્વૉઇસ હિસ્ટ્રી','Party Payments':'પાર્ટી ચુકવણી','Supplier Payments':'સપ્લાયર ચુકવણી','Truck / Supplier Entries':'ટ્રક / સપ્લાયર એન્ટ્રીઓ','Account':'હિસાબ','Office':'ઓફિસ','Party Khata':'પાર્ટી ખાતું','Supplier Khata':'સપ્લાયર ખાતું','Truck & Document':'ટ્રક અને દસ્તાવેજ','Master':'માસ્ટર','Forms':'ફોર્મ','Reports & Audit':'રિપોર્ટ અને ઑડિટ','Khata':'ખાતું','Home':'હોમ','Trips':'ટ્રિપ્સ','Invoices':'ઇન્વૉઇસ','Parties':'પાર્ટીઓ','Suppliers':'સપ્લાયરો','More':'વધુ','Back':'પાછા','Go back':'પાછા જાઓ',
    'Online':'ઑનલાઇન','Offline':'ઑફલાઇન','Refresh':'રિફ્રેશ','Backup':'બેકઅપ','Logout':'લૉગઆઉટ','Alerts':'સૂચનાઓ','Settings':'સેટિંગ્સ','Smart Tools':'સ્માર્ટ ટૂલ્સ','Smart Operations':'સ્માર્ટ ઓપરેશન્સ','Company & Plan':'કંપની અને પ્લાન','Team & Access':'ટીમ અને ઍક્સેસ','Notifications':'સૂચનાઓ','Calendar':'કૅલેન્ડર','Scheduled Backups':'નક્કી કરેલા બેકઅપ','System Health':'સિસ્ટમ હેલ્થ','Excel Center':'Excel સેન્ટર','Truck Gallery':'ટ્રક ગૅલેરી',
    'Today Freight':'આજનું ભાડું','Party Due':'પાર્ટી બાકી','Party Receivable':'પાર્ટી પાસેથી લેવાના','Supplier Payable':'સપ્લાયરને આપવાના','Total Billing':'કુલ બિલિંગ','Party Received':'પાર્ટી પાસેથી મળેલ','Estimated Profit':'અંદાજિત નફો','Total Trips':'કુલ ટ્રિપ્સ','Invoice Subtotal':'ઇન્વૉઇસ સબટોટલ','Supplier Paid':'સપ્લાયરને ચૂકવેલ','Office Expenses':'ઓફિસ ખર્ચ','Party Outstanding':'પાર્ટી બાકી','Recent Trips':'તાજેતરની ટ્રિપ્સ','Recent Changes':'તાજેતરના ફેરફારો','View all':'બધું જુઓ','View all ›':'બધું જુઓ ›','Khata ›':'ખાતું ›',
    'New Trip':'નવી ટ્રિપ','New Invoice':'નવું ઇન્વૉઇસ','New Party Payment':'નવી પાર્ટી ચુકવણી','New Supplier Payment':'નવી સપ્લાયર ચુકવણી','New Truck Entry':'નવી ટ્રક એન્ટ્રી','New Expense':'નવો ખર્ચ','Add Party':'પાર્ટી ઉમેરો','Add Supplier':'સપ્લાયર ઉમેરો','Add Truck':'ટ્રક ઉમેરો','Add Route':'રૂટ ઉમેરો','Add Material':'મટીરિયલ ઉમેરો','Add New Party':'નવી પાર્ટી ઉમેરો','Add New Supplier':'નવો સપ્લાયર ઉમેરો','Add New Truck':'નવી ટ્રક ઉમેરો','Add New Route':'નવો રૂટ ઉમેરો','Add New Material':'નવું મટીરિયલ ઉમેરો',
    'Edit':'સુધારો','Delete':'ડિલીટ','View':'જુઓ','Download':'ડાઉનલોડ','Share':'શેર','Save':'સેવ','Update':'અપડેટ','Cancel':'રદ કરો','Print':'પ્રિન્ટ','Preview':'પ્રીવ્યૂ','Restore':'રીસ્ટોર','Solve':'ઉકેલો','Search':'શોધો','Action':'કાર્ય','Status':'સ્થિતિ','Date':'તારીખ','Type':'પ્રકાર','Amount':'રકમ','Total':'કુલ','Pending':'બાકી','Paid':'ચૂકવેલ','Received':'મળેલ','Balance':'બેલેન્સ','Notes':'નોંધ','Details':'વિગત','Document':'દસ્તાવેજ','Documents':'દસ્તાવેજો','Route':'રૂટ','Routes':'રૂટ્સ','Route Master':'રૂટ માસ્ટર','Trucks / Routes':'ટ્રક / રૂટ્સ','Material':'મટીરિયલ','Weight':'વજન','Rate':'રેટ','Commission':'કમિશન','Advance':'એડવાન્સ','Loading Point':'લોડિંગ પોઇન્ટ','Unloading Point':'અનલોડિંગ પોઇન્ટ','Truck Number':'ટ્રક નંબર','Owner Name':'માલિકનું નામ','Party Name':'પાર્ટીનું નામ','Supplier Name':'સપ્લાયરનું નામ','Mobile':'મોબાઇલ','Address':'સરનામું','Bank Details':'બૅન્ક વિગત','GST Number':'GST નંબર','Invoice Number':'ઇન્વૉઇસ નંબર','Invoice Date':'ઇન્વૉઇસ તારીખ','Trip No.':'ટ્રિપ નં.','Invoice':'ઇન્વૉઇસ','Party':'પાર્ટી','Truck / Supplier':'ટ્રક / સપ્લાયર','Truck / Route':'ટ્રક / રૂટ','LR / Material':'LR / મટીરિયલ','Subtotal':'સબટોટલ','GST':'GST','POD':'POD','Category':'કૅટેગરી','Debit':'ડેબિટ','Credit':'ક્રેડિટ','Invoice / Ref':'ઇન્વૉઇસ / રેફરન્સ',
    'PAID':'ચૂકવેલ','PENDING':'બાકી','PARTIAL':'આંશિક','DELIVERED':'ડિલિવર થયેલ','BOOKED':'બુક થયેલ','TRANSIT':'રસ્તામાં','COMPLETED':'પૂર્ણ','APPROVED':'મંજૂર','REJECTED':'નકારેલ','WARNING':'ચેતવણી','HEALTHY':'સ્વસ્થ','ATTENTION':'ધ્યાન જરૂરી',
    'No records found.':'કોઈ રેકોર્ડ મળ્યો નથી.','No result':'કોઈ પરિણામ નથી','No bookings. Create the first booking.':'કોઈ બુકિંગ નથી. પ્રથમ બુકિંગ બનાવો.','No approval requests.':'કોઈ approval request નથી.','Recycle Bin is empty.':'Recycle Bin ખાલી છે.','No detected ledger issues.':'કોઈ ledger issue મળ્યો નથી.','Loading...':'લોડ થઈ રહ્યું છે...','Saving...':'સેવ થઈ રહ્યું છે...','Logging in...':'લૉગિન થઈ રહ્યું છે...','Opening Meera Logistics ERP…':'Meera Logistics ERP ખુલી રહ્યું છે…','Connecting to online database':'Online database સાથે જોડાઈ રહ્યું છે',
    'Welcome back':'ફરી સ્વાગત છે','Sign in to Transport ERP':'Transport ERPમાં સાઇન ઇન કરો','Username':'યુઝરનેમ','Password':'પાસવર્ડ','Login':'લૉગિન','OR':'અથવા','Create Transport Company · 14 Day Trial':'Transport Company બનાવો · 14 દિવસ Trial','Create Transport Company':'Transport Company બનાવો','Create & Start Trial':'બનાવો અને Trial શરૂ કરો','Free Trial includes':'Free Trialમાં સામેલ','Company Details':'કંપનીની વિગત','Company Name':'કંપનીનું નામ','Owner Name':'માલિકનું નામ','Email':'ઈમેલ','Company Address':'કંપનીનું સરનામું','Secure Login':'સુરક્ષિત લૉગિન','Login Username':'લૉગિન યુઝરનેમ',
    'Invoice Desk':'ઇન્વૉઇસ ડેસ્ક','GST invoices linked with trips':'ટ્રિપ સાથે જોડાયેલા GST ઇન્વૉઇસ','Trip booking, status and POD':'ટ્રિપ બુકિંગ, સ્થિતિ અને POD','Invoice-wise billing, receipts and outstanding':'ઇન્વૉઇસ મુજબ બિલિંગ, રસીદ અને બાકી','Supplier-wise payable, payments, linked trucks ane ledger details':'સપ્લાયર મુજબ ચૂકવવાના, ચુકવણી, જોડાયેલ ટ્રક અને ખાતાની વિગત','Invoice, receipt and outstanding ledger':'ઇન્વૉઇસ, રસીદ અને બાકી ખાતું','Supplier payable, payments and truck ledger':'સપ્લાયર ચુકવવાના, ચુકવણી અને ટ્રક ખાતું','Expense register used in profit calculation':'નફાની ગણતરીમાં વપરાતો ખર્ચ રજિસ્ટર','Latest transport movements':'તાજેતરની ટ્રાન્સપોર્ટ હિલચાલ','Highest pending accounts':'સૌથી વધુ બાકી ખાતાં','All transport entries':'બધી ટ્રાન્સપોર્ટ એન્ટ્રીઓ','Outstanding from parties':'પાર્ટીઓ પાસેથી બાકી','Pending to truck owners':'ટ્રક માલિકોને આપવાનું બાકી','Collection received':'મળેલ વસૂલાત','Before income tax':'Income tax પહેલાં',
    'Search trips…':'ટ્રિપ શોધો…','Search invoices…':'ઇન્વૉઇસ શોધો…','Search expenses…':'ખર્ચ શોધો…','Search party…':'પાર્ટી શોધો…','Search supplier…':'સપ્લાયર શોધો…','Search truck…':'ટ્રક શોધો…','Select Party':'પાર્ટી પસંદ કરો','Select Supplier':'સપ્લાયર પસંદ કરો','Select Truck Number':'ટ્રક નંબર પસંદ કરો','Select Loading Point':'લોડિંગ પોઇન્ટ પસંદ કરો','Select Unloading Point':'અનલોડિંગ પોઇન્ટ પસંદ કરો','Select Material':'મટીરિયલ પસંદ કરો','Excel CSV':'Excel CSV','Download Full Excel':'સંપૂર્ણ Excel ડાઉનલોડ','Generate Month':'મહિનો બનાવો','Backup Now':'હમણાં બેકઅપ','Save Settings':'સેટિંગ્સ સેવ કરો','Reset Defaults':'ડિફૉલ્ટ પર રીસેટ','Show Online/Offline Status':'Online/Offline સ્થિતિ બતાવો','Enable Scheduled Backups':'નક્કી કરેલા બેકઅપ ચાલુ રાખો'
  };

  const HI={
    'Language':'भाषा','Choose App Language':'ऐप की भाषा चुनें','Select the language used for menus, buttons and messages.':'मेन्यू, बटन और संदेशों की भाषा चुनें।','Your saved business data will not be changed.':'आपका सेव किया हुआ बिज़नेस डेटा नहीं बदलेगा।','Current language':'वर्तमान भाषा','Selected':'चुनी हुई','Close':'बंद करें',
    'Dashboard':'डैशबोर्ड','Trip History':'ट्रिप हिस्ट्री','Invoice History':'इनवॉइस हिस्ट्री','Party Payments':'पार्टी पेमेंट','Supplier Payments':'सप्लायर पेमेंट','Truck / Supplier Entries':'ट्रक / सप्लायर एंट्री','Account':'खाता','Office':'ऑफिस','Party Khata':'पार्टी खाता','Supplier Khata':'सप्लायर खाता','Truck & Document':'ट्रक और दस्तावेज़','Master':'मास्टर','Forms':'फॉर्म','Reports & Audit':'रिपोर्ट और ऑडिट','Khata':'खाता','Home':'होम','Trips':'ट्रिप्स','Invoices':'इनवॉइस','Parties':'पार्टियाँ','Suppliers':'सप्लायर','More':'और','Back':'वापस','Go back':'वापस जाएँ',
    'Online':'ऑनलाइन','Offline':'ऑफलाइन','Refresh':'रिफ्रेश','Backup':'बैकअप','Logout':'लॉगआउट','Alerts':'सूचनाएँ','Settings':'सेटिंग्स','Smart Tools':'स्मार्ट टूल्स','Smart Operations':'स्मार्ट ऑपरेशन्स','Company & Plan':'कंपनी और प्लान','Team & Access':'टीम और एक्सेस','Notifications':'सूचनाएँ','Calendar':'कैलेंडर','Scheduled Backups':'निर्धारित बैकअप','System Health':'सिस्टम हेल्थ','Excel Center':'Excel सेंटर','Truck Gallery':'ट्रक गैलरी',
    'Today Freight':'आज का भाड़ा','Party Due':'पार्टी बकाया','Party Receivable':'पार्टी से लेना','Supplier Payable':'सप्लायर को देना','Total Billing':'कुल बिलिंग','Party Received':'पार्टी से मिला','Estimated Profit':'अनुमानित लाभ','Total Trips':'कुल ट्रिप्स','Invoice Subtotal':'इनवॉइस सबटोटल','Supplier Paid':'सप्लायर को भुगतान','Office Expenses':'ऑफिस खर्च','Party Outstanding':'पार्टी बकाया','Recent Trips':'हाल की ट्रिप्स','Recent Changes':'हाल के बदलाव','View all':'सभी देखें','View all ›':'सभी देखें ›','Khata ›':'खाता ›',
    'New Trip':'नई ट्रिप','New Invoice':'नया इनवॉइस','New Party Payment':'नई पार्टी पेमेंट','New Supplier Payment':'नई सप्लायर पेमेंट','New Truck Entry':'नई ट्रक एंट्री','New Expense':'नया खर्च','Add Party':'पार्टी जोड़ें','Add Supplier':'सप्लायर जोड़ें','Add Truck':'ट्रक जोड़ें','Add Route':'रूट जोड़ें','Add Material':'मटेरियल जोड़ें','Add New Party':'नई पार्टी जोड़ें','Add New Supplier':'नया सप्लायर जोड़ें','Add New Truck':'नया ट्रक जोड़ें','Add New Route':'नया रूट जोड़ें','Add New Material':'नया मटेरियल जोड़ें',
    'Edit':'सुधारें','Delete':'डिलीट','View':'देखें','Download':'डाउनलोड','Share':'शेयर','Save':'सेव','Update':'अपडेट','Cancel':'रद्द करें','Print':'प्रिंट','Preview':'प्रीव्यू','Restore':'रीस्टोर','Solve':'हल करें','Search':'खोजें','Action':'कार्य','Status':'स्थिति','Date':'तारीख','Type':'प्रकार','Amount':'राशि','Total':'कुल','Pending':'बकाया','Paid':'भुगतान','Received':'प्राप्त','Balance':'बैलेंस','Notes':'नोट','Details':'विवरण','Document':'दस्तावेज़','Documents':'दस्तावेज़','Route':'रूट','Routes':'रूट्स','Route Master':'रूट मास्टर','Trucks / Routes':'ट्रक / रूट्स','Material':'मटेरियल','Weight':'वज़न','Rate':'रेट','Commission':'कमीशन','Advance':'एडवांस','Loading Point':'लोडिंग पॉइंट','Unloading Point':'अनलोडिंग पॉइंट','Truck Number':'ट्रक नंबर','Owner Name':'मालिक का नाम','Party Name':'पार्टी का नाम','Supplier Name':'सप्लायर का नाम','Mobile':'मोबाइल','Address':'पता','Bank Details':'बैंक विवरण','GST Number':'GST नंबर','Invoice Number':'इनवॉइस नंबर','Invoice Date':'इनवॉइस तारीख','Trip No.':'ट्रिप नं.','Invoice':'इनवॉइस','Party':'पार्टी','Truck / Supplier':'ट्रक / सप्लायर','Truck / Route':'ट्रक / रूट','LR / Material':'LR / मटेरियल','Subtotal':'सबटोटल','GST':'GST','POD':'POD','Category':'श्रेणी','Debit':'डेबिट','Credit':'क्रेडिट','Invoice / Ref':'इनवॉइस / रेफरेंस',
    'PAID':'भुगतान','PENDING':'बकाया','PARTIAL':'आंशिक','DELIVERED':'डिलीवर','BOOKED':'बुक','TRANSIT':'रास्ते में','COMPLETED':'पूर्ण','APPROVED':'मंज़ूर','REJECTED':'अस्वीकृत','WARNING':'चेतावनी','HEALTHY':'स्वस्थ','ATTENTION':'ध्यान दें',
    'No records found.':'कोई रिकॉर्ड नहीं मिला।','No result':'कोई परिणाम नहीं','No bookings. Create the first booking.':'कोई बुकिंग नहीं है। पहली बुकिंग बनाएँ।','No approval requests.':'कोई अप्रूवल अनुरोध नहीं है।','Recycle Bin is empty.':'Recycle Bin खाली है।','No detected ledger issues.':'कोई लेजर समस्या नहीं मिली।','Loading...':'लोड हो रहा है...','Saving...':'सेव हो रहा है...','Logging in...':'लॉगिन हो रहा है...','Opening Meera Logistics ERP…':'Meera Logistics ERP खुल रहा है…','Connecting to online database':'ऑनलाइन डेटाबेस से जुड़ रहा है',
    'Welcome back':'फिर से स्वागत है','Sign in to Transport ERP':'Transport ERP में साइन इन करें','Username':'यूज़रनेम','Password':'पासवर्ड','Login':'लॉगिन','OR':'या','Create Transport Company · 14 Day Trial':'Transport Company बनाएँ · 14 दिन Trial','Create Transport Company':'Transport Company बनाएँ','Create & Start Trial':'बनाएँ और Trial शुरू करें','Free Trial includes':'Free Trial में शामिल','Company Details':'कंपनी विवरण','Company Name':'कंपनी का नाम','Owner Name':'मालिक का नाम','Email':'ईमेल','Company Address':'कंपनी का पता','Secure Login':'सुरक्षित लॉगिन','Login Username':'लॉगिन यूज़रनेम',
    'Invoice Desk':'इनवॉइस डेस्क','GST invoices linked with trips':'ट्रिप से जुड़े GST इनवॉइस','Trip booking, status and POD':'ट्रिप बुकिंग, स्थिति और POD','Invoice-wise billing, receipts and outstanding':'इनवॉइस अनुसार बिलिंग, प्राप्ति और बकाया','Supplier-wise payable, payments, linked trucks ane ledger details':'सप्लायर अनुसार देय, भुगतान, जुड़े ट्रक और खाते का विवरण','Invoice, receipt and outstanding ledger':'इनवॉइस, प्राप्ति और बकाया खाता','Supplier payable, payments and truck ledger':'सप्लायर देय, भुगतान और ट्रक खाता','Expense register used in profit calculation':'लाभ की गणना में उपयोग होने वाला खर्च रजिस्टर','Latest transport movements':'हाल की ट्रांसपोर्ट गतिविधि','Highest pending accounts':'सबसे अधिक बकाया खाते','All transport entries':'सभी ट्रांसपोर्ट एंट्री','Outstanding from parties':'पार्टियों से बकाया','Pending to truck owners':'ट्रक मालिकों को देना बाकी','Collection received':'प्राप्त कलेक्शन','Before income tax':'Income tax से पहले',
    'Search trips…':'ट्रिप खोजें…','Search invoices…':'इनवॉइस खोजें…','Search expenses…':'खर्च खोजें…','Search party…':'पार्टी खोजें…','Search supplier…':'सप्लायर खोजें…','Search truck…':'ट्रक खोजें…','Select Party':'पार्टी चुनें','Select Supplier':'सप्लायर चुनें','Select Truck Number':'ट्रक नंबर चुनें','Select Loading Point':'लोडिंग पॉइंट चुनें','Select Unloading Point':'अनलोडिंग पॉइंट चुनें','Select Material':'मटेरियल चुनें','Excel CSV':'Excel CSV','Download Full Excel':'पूरा Excel डाउनलोड','Generate Month':'महीना बनाएँ','Backup Now':'अभी बैकअप','Save Settings':'सेटिंग्स सेव करें','Reset Defaults':'डिफ़ॉल्ट रीसेट','Show Online/Offline Status':'Online/Offline स्थिति दिखाएँ','Enable Scheduled Backups':'निर्धारित बैकअप चालू रखें'
  };

  // V68.5 completes the UI dictionary across every operational screen. Keep
  // these labels separate from business values: party, supplier, truck,
  // material and document data must always remain exactly as entered.
  Object.assign(GU,{
    'Receive':'રકમ મેળવો','Pay Supplier':'સપ્લાયરને ચૂકવો','Receive Payment':'ચુકવણી મેળવો','Receive Party Payment':'પાર્ટીની ચુકવણી મેળવો','Save Receipt':'રસીદ સેવ કરો','Save Payment':'ચુકવણી સેવ કરો','Payment':'ચુકવણી','Payments':'ચુકવણીઓ','Receipt':'રસીદ','Reference':'રેફરન્સ','Mode':'માધ્યમ','Owner':'માલિક','Trip':'ટ્રિપ','Bill':'બિલ','Profit':'નફો','Outstanding':'બાકી','Payable':'ચૂકવવાનું','Supplier Pending':'સપ્લાયર બાકી','Ledger View':'ખાતું જુઓ','Open Trip':'ટ્રિપ ખોલો','Recent Entries':'તાજેતરની એન્ટ્રીઓ','Reports ›':'રિપોર્ટ ›','Receive & invoice ledger':'મળેલી રકમ અને ઇન્વૉઇસ ખાતું','Payable & truck ledger':'ચૂકવવાનું અને ટ્રક ખાતું','Party Receipt':'પાર્ટી રસીદ','Supplier Payment':'સપ્લાયર ચુકવણી','Expense':'ખર્ચ','Office Expense':'ઓફિસ ખર્ચ','Supplier:':'સપ્લાયર:','Driver:':'ડ્રાઇવર:','Billed':'બિલ કરેલ','Advance/Credit':'એડવાન્સ/ક્રેડિટ','No owner':'માલિક નથી','No GST':'GST નથી','No ledger number':'ખાતા નંબર નથી',
    'Create transport booking':'ટ્રાન્સપોર્ટ બુકિંગ બનાવો','Create GST invoice':'GST ઇન્વૉઇસ બનાવો','Party collection entry':'પાર્ટી પાસેથી મળેલી રકમની એન્ટ્રી','Truck malik payment':'ટ્રક માલિકને ચુકવણી','BILTY VIEW':'બિલ્ટી દૃશ્ય','No trips yet.':'હજુ કોઈ ટ્રિપ નથી.','No trips found.':'કોઈ ટ્રિપ મળી નથી.','No trips.':'કોઈ ટ્રિપ નથી.','No party outstanding.':'કોઈ પાર્ટી બાકી નથી.','No outstanding.':'કોઈ બાકી નથી.','No invoices for this party.':'આ પાર્ટી માટે કોઈ ઇન્વૉઇસ નથી.','No recent payment entries.':'તાજેતરની કોઈ ચુકવણી એન્ટ્રી નથી.','Search trip, party, truck…':'ટ્રિપ, પાર્ટી અથવા ટ્રક શોધો…','Search party or invoice…':'પાર્ટી અથવા ઇન્વૉઇસ શોધો…','Search payments…':'ચુકવણી શોધો…','Search supplier or truck…':'સપ્લાયર અથવા ટ્રક શોધો…','Search supplier payments…':'સપ્લાયર ચુકવણી શોધો…','Search entries…':'એન્ટ્રી શોધો…','Search truck or owner…':'ટ્રક અથવા માલિક શોધો…','Search document…':'દસ્તાવેજ શોધો…',
    'Party Payment History':'પાર્ટી ચુકવણી હિસ્ટ્રી','Supplier Payment History':'સપ્લાયર ચુકવણી હિસ્ટ્રી','TransportBook-style receipt register':'ચુકવણી રસીદ રજિસ્ટર','Truck malik payment register':'ટ્રક માલિક ચુકવણી રજિસ્ટર','Freight payable per truck trip':'દરેક ટ્રિપ મુજબ ટ્રક ભાડું ચૂકવવાનું','Truck Fleet':'ટ્રક સમૂહ','Truck Master':'ટ્રક માસ્ટર','Owner and bank details':'માલિક અને બૅન્કની વિગત','Recent Documents':'તાજેતરના દસ્તાવેજો','No documents.':'કોઈ દસ્તાવેજ નથી.','No trucks found.':'કોઈ ટ્રક મળ્યો નથી.','No truck linked':'કોઈ ટ્રક જોડાયેલ નથી','No truck documents.':'ટ્રકનો કોઈ દસ્તાવેજ નથી.','No vehicle linked yet.':'હજુ કોઈ વાહન જોડાયેલ નથી.','documents & owners':'દસ્તાવેજો અને માલિકો','Document Type':'દસ્તાવેજ પ્રકાર','Expiry Date':'સમાપ્તિ તારીખ','Image / PDF':'ઇમેજ / PDF','Images / PDFs (multiple)':'ઇમેજ / PDF (એકથી વધુ)','Upload Document':'દસ્તાવેજ અપલોડ કરો','Upload All':'બધું અપલોડ કરો','Upload Multiple Truck Documents':'ટ્રકના અનેક દસ્તાવેજ અપલોડ કરો','Truck Documents Gallery':'ટ્રક દસ્તાવેજ ગૅલેરી','All Trucks':'બધા ટ્રક','Add Another Truck':'બીજો ટ્રક ઉમેરો','DOC +':'દસ્તાવેજ +',
    'New Party':'નવી પાર્ટી','New Entry':'નવી એન્ટ્રી','New PM Bill':'નવું PM બિલ','PM Non-GST Bills':'PM Non-GST બિલ','Total PM Billing':'કુલ PM બિલિંગ','PM Profit':'PM નફો','Party Bill':'પાર્ટી બિલ','Supplier':'સપ્લાયર','Truck':'ટ્રક','Trip / Ref':'ટ્રિપ / રેફરન્સ','Route / Detail':'રૂટ / વિગત','Weight × Rate':'વજન × રેટ','Bill No.':'બિલ નં.','Invoice No.':'ઇન્વૉઇસ નં.','Payment Date':'ચુકવણી તારીખ','Payment Mode':'ચુકવણી માધ્યમ','Owner / Supplier':'માલિક / સપ્લાયર','Owner Mobile':'માલિકનો મોબાઇલ','Material Name':'મટીરિયલનું નામ','Party GST':'પાર્ટી GST','Party GST Number':'પાર્ટી GST નંબર','Party Address':'પાર્ટીનું સરનામું','Party Billing Rate':'પાર્ટી બિલિંગ રેટ','Party Rate':'પાર્ટી રેટ','Party Amount':'પાર્ટી રકમ','Supplier Rate':'સપ્લાયર રેટ','Supplier Advance':'સપ્લાયર એડવાન્સ','Supplier Vehicles':'સપ્લાયર વાહનો','Supplier / Truck Malik Name':'સપ્લાયર / ટ્રક માલિકનું નામ','Supplier / Truck Malik':'સપ્લાયર / ટ્રક માલિક','Supplier / Truck':'સપ્લાયર / ટ્રક','Save Supplier & Truck':'સપ્લાયર અને ટ્રક સેવ કરો','Edit Supplier':'સપ્લાયર સુધારો','Edit Supplier & Truck':'સપ્લાયર અને ટ્રક સુધારો','New Truck Add':'નવો ટ્રક ઉમેરો','New Supplier Add':'નવો સપ્લાયર ઉમેરો','Payer / Party':'ચુકવણી કરનાર / પાર્ટી','Payer Address':'ચુકવણી કરનારનું સરનામું',
    'Add':'ઉમેરો','Remove':'દૂર કરો','Complete':'પૂર્ણ કરો','Create Bill':'બિલ બનાવો','Create / Update Invoice With This Trip':'આ ટ્રિપથી ઇન્વૉઇસ બનાવો / અપડેટ કરો','Add Party Payment':'પાર્ટી ચુકવણી ઉમેરો','Add Supplier Payment':'સપ્લાયર ચુકવણી ઉમેરો','Add Expense':'ખર્ચ ઉમેરો','Edit Universal Trip':'ટ્રિપ સુધારો','Trip Details':'ટ્રિપની વિગત','TRIP DETAILS':'ટ્રિપની વિગત','Trip Date':'ટ્રિપ તારીખ','Loading Date':'લોડિંગ તારીખ','Trip Type':'ટ્રિપ પ્રકાર','Trip Freight Amount':'ટ્રિપ ભાડાની રકમ','Freight Amount':'ભાડાની રકમ','LR Number':'LR નંબર','Driver Name':'ડ્રાઇવરનું નામ','Driver Mobile':'ડ્રાઇવર મોબાઇલ','Comments / Payment Terms':'ટિપ્પણી / ચુકવણી શરતો','Invoice Allocation':'ઇન્વૉઇસ ફાળવણી','Party Advance / Auto FIFO':'પાર્ટી એડવાન્સ / આપમેળે FIFO','Select Supplier First':'પહેલા સપ્લાયર પસંદ કરો','Select Truck':'ટ્રક પસંદ કરો','Select':'પસંદ કરો','Enter new Value':'નવી કિંમત દાખલ કરો',
    'Party Master':'પાર્ટી માસ્ટર','Material Master':'મટીરિયલ માસ્ટર','TDS Declaration':'TDS ઘોષણાપત્ર','TDS Declaration Form':'TDS ઘોષણાપત્ર ફોર્મ','TDS Declaration Preview':'TDS ઘોષણાપત્ર પ્રીવ્યૂ','Create Form':'ફોર્મ બનાવો','More Forms':'વધુ ફોર્મ','PAYER DETAILS':'ચુકવણી કરનારની વિગત','MEERA LOGISTICS DETAILS':'MEERA LOGISTICSની વિગત','Entity Type':'એકમ પ્રકાર','Firm Name':'ફર્મનું નામ','Firm PAN':'ફર્મ PAN','Firm GST Number':'ફર્મ GST નંબર','Phone':'ફોન','Firm Address':'ફર્મનું સરનામું','Authorized Partner':'અધિકૃત ભાગીદાર','Authorized Partner Name':'અધિકૃત ભાગીદારનું નામ','Place':'સ્થળ','Financial Year':'નાણાકીય વર્ષ','Maximum Goods Carriages':'મહત્તમ માલવાહક વાહનો','Print / Save PDF':'પ્રિન્ટ / PDF સેવ કરો','More office forms can be added here later.':'બીજા ઓફિસ ફોર્મ અહીં આગળ ઉમેરી શકાશે.',
    'Accounting Allocation V66.5':'હિસાબ ફાળવણી V66.5','Exact invoice receipts + locked one-time allocation for old receipts':'ચોક્કસ ઇન્વૉઇસ રસીદ અને જૂની રસીદ માટે એક વખતની સુરક્ષિત ફાળવણી','Legacy FIFO:':'જૂનું FIFO:','Unallocated Credit:':'ફાળવ્યા વગરનું ક્રેડિટ:','Invoice Pending:':'ઇન્વૉઇસ બાકી:','Run Full Accounting Audit':'સંપૂર્ણ હિસાબ ઑડિટ ચલાવો','Audit Alerts':'ઑડિટ સૂચનાઓ','Restore Backup':'બેકઅપ રિસ્ટોર કરો','No accounting/data-isolation issue detected.':'હિસાબ અથવા ડેટા અલગાવની કોઈ સમસ્યા મળી નથી.','Accounting isolation checks passed':'હિસાબ અલગાવની તપાસ સફળ','Audit needs attention':'ઑડિટ પર ધ્યાન જરૂરી','Billing':'બિલિંગ','Supplier Pending':'સપ્લાયર બાકી','Checked':'તપાસ્યું','Company':'કંપની','Cross-company links':'બીજી કંપની સાથેની લિંક્સ','errors':'ભૂલો','warnings':'ચેતવણીઓ',
    'Smart Tools':'સ્માર્ટ ટૂલ્સ','Meera Logistics Smart Operations':'Meera Logistics સ્માર્ટ કામગીરી','Booking Workflow':'બુકિંગ પ્રક્રિયા','Approvals':'મંજૂરીઓ','Recycle Bin':'રીસાયકલ બિન','Super Admin':'સુપર એડમિન','Trips, bookings, invoices and expiry dates':'ટ્રિપ, બુકિંગ, ઇન્વૉઇસ અને સમાપ્તિ તારીખો','Outstanding, supplier pending, expiry, approvals and trial alerts':'પાર્ટી બાકી, સપ્લાયર બાકી, સમાપ્તિ, મંજૂરી અને ટ્રાયલ સૂચનાઓ','Booking → Approval → Dispatch → Trip':'બુકિંગ → મંજૂરી → ડિસ્પેચ → ટ્રિપ','Pending booking approvals':'બાકી બુકિંગ મંજૂરીઓ','Restore deleted records safely':'ડિલીટ કરેલા રેકોર્ડ સુરક્ષિત રીતે પાછા લાવો','Database and ledger diagnostics':'ડેટાબેઝ અને ખાતાની તપાસ','Full export, import and monthly files':'સંપૂર્ણ એક્સપોર્ટ, ઇમ્પોર્ટ અને માસિક ફાઇલ','Daily Cloudflare backup snapshots':'દરરોજ Cloudflare બેકઅપ','Multiple document images per truck':'દરેક ટ્રક માટે અનેક દસ્તાવેજ ઇમેજ','Company profile, subscription and usage':'કંપની પ્રોફાઇલ, સબ્સ્ક્રિપ્શન અને ઉપયોગ','Owner, Admin, Accountant, Operator and Viewer':'Owner, Admin, Accountant, Operator અને Viewer','Company details, interface and backup defaults':'કંપનીની વિગત, ઇન્ટરફેસ અને બેકઅપ ડિફૉલ્ટ','Command Palette':'કમાન્ડ પેલેટ','Type command, invoice, trip, party, truck…':'કમાન્ડ, ઇન્વૉઇસ, ટ્રિપ, પાર્ટી અથવા ટ્રક લખો…','No matching invoice, trip, party, supplier or truck found.':'મેળ ખાતું ઇન્વૉઇસ, ટ્રિપ, પાર્ટી, સપ્લાયર અથવા ટ્રક મળ્યું નથી.',
    'Company & Subscription':'કંપની અને સબ્સ્ક્રિપ્શન','Company Profile':'કંપની પ્રોફાઇલ','Legal Name':'કાયદેસર નામ','PAN Number':'PAN નંબર','GST Invoice Prefix':'GST ઇન્વૉઇસ પ્રિફિક્સ','Non-GST Prefix':'Non-GST પ્રિફિક્સ','Trip Prefix':'ટ્રિપ પ્રિફિક્સ','Supplier Prefix':'સપ્લાયર પ્રિફિક્સ','Save Company':'કંપની સેવ કરો','Subscription Plans':'સબ્સ્ક્રિપ્શન પ્લાન','Current Plan':'હાલનો પ્લાન','CURRENT PLAN':'હાલનો પ્લાન','YOUR ROLE':'તમારી ભૂમિકા','THIS MONTH':'આ મહિનો','COMPANY':'કંપની','Read Only Mode':'માત્ર વાંચી શકાય તેવો મોડ','14-Day Trial':'14 દિવસની ટ્રાયલ','Plan request pending':'પ્લાન વિનંતી બાકી','Billing status:':'બિલિંગ સ્થિતિ:','Trial only':'માત્ર ટ્રાયલ','Request Pending':'વિનંતી બાકી','Price via Play Billing':'Play Billing દ્વારા કિંમત','Full access':'સંપૂર્ણ ઍક્સેસ','Limited access':'મર્યાદિત ઍક્સેસ',
    'Add Staff Login':'સ્ટાફ લૉગિન ઉમેરો','Full Name':'પૂરું નામ','Role':'ભૂમિકા','Temporary Password':'અસ્થાયી પાસવર્ડ','Create Staff Login':'સ્ટાફ લૉગિન બનાવો','Edit Staff Access':'સ્ટાફ ઍક્સેસ સુધારો','Save Access':'ઍક્સેસ સેવ કરો','New Password (optional)':'નવો પાસવર્ડ (વૈકલ્પિક)','Active':'સક્રિય','Disabled':'બંધ','No team users':'કોઈ ટીમ યુઝર નથી','Owner/Admin only':'માત્ર Owner/Admin','Staff login created':'સ્ટાફ લૉગિન બન્યું','Staff access updated':'સ્ટાફ ઍક્સેસ અપડેટ થઈ','Company profile saved':'કંપની પ્રોફાઇલ સેવ થઈ','Plan request submitted':'પ્લાન વિનંતી મોકલાઈ',
    'Company Settings':'કંપની સેટિંગ્સ','Invoice Defaults':'ઇન્વૉઇસ ડિફૉલ્ટ','Interface & Safety':'ઇન્ટરફેસ અને સુરક્ષા','Interface Density':'ઇન્ટરફેસ ઘનતા','Comfortable':'આરામદાયક','Compact':'કોમ્પેક્ટ','Default SGST %':'ડિફૉલ્ટ SGST %','Default CGST %':'ડિફૉલ્ટ CGST %','Default Payment Terms':'ડિફૉલ્ટ ચુકવણી શરતો','Settings saved':'સેટિંગ્સ સેવ થઈ','Default settings restored':'ડિફૉલ્ટ સેટિંગ્સ પાછાં આવ્યા','Offline · Changes queued':'ઑફલાઇન · ફેરફારો કતારમાં','Online — offline changes syncing':'ઑનલાઇન — ઑફલાઇન ફેરફારો સિંક થઈ રહ્યા છે','Changes queued':'ફેરફારો કતારમાં',
    'Professional Calendar':'વ્યવસાયિક કૅલેન્ડર','Booking':'બુકિંગ','Bookings':'બુકિંગ','Expiry':'સમાપ્તિ','Document expiry':'દસ્તાવેજ સમાપ્તિ','more':'વધુ','New Booking':'નવું બુકિંગ','Edit Booking':'બુકિંગ સુધારો','Booking Date':'બુકિંગ તારીખ','Expected Delivery':'અપેક્ષિત ડિલિવરી','Save Booking':'બુકિંગ સેવ કરો','Send Approval':'મંજૂરી માટે મોકલો','Dispatch':'ડિસ્પેચ','Create Trip':'ટ્રિપ બનાવો','Booking saved':'બુકિંગ સેવ થયું','Booking Workflow':'બુકિંગ પ્રક્રિયા','Approval Queue':'મંજૂરી કતાર','Approve':'મંજૂર કરો','Reject':'નકારો','No approval requests.':'કોઈ મંજૂરી વિનંતી નથી.','Recycle Bin is empty.':'રીસાયકલ બિન ખાલી છે.','Delete Forever':'કાયમ માટે ડિલીટ','System Health Dashboard':'સિસ્ટમ હેલ્થ ડેશબોર્ડ','Database Records':'ડેટાબેઝ રેકોર્ડ','HEALTHY':'સ્વસ્થ','ATTENTION':'ધ્યાન જરૂરી',
    'Excel Import / Export Center':'Excel ઇમ્પોર્ટ / એક્સપોર્ટ સેન્ટર','Full Excel Export':'સંપૂર્ણ Excel એક્સપોર્ટ','Full Excel Import':'સંપૂર્ણ Excel ઇમ્પોર્ટ','Monthly Excel Generation':'માસિક Excel બનાવો','Import':'ઇમ્પોર્ટ','No monthly files generated yet.':'હજુ કોઈ માસિક ફાઇલ બની નથી.','Select Excel/CSV/JSON file.':'Excel/CSV/JSON ફાઇલ પસંદ કરો.','Excel import complete':'Excel ઇમ્પોર્ટ પૂર્ણ','Monthly Excel generated':'માસિક Excel બની ગયું','Automatic daily backup':'આપમેળે દૈનિક બેકઅપ','Download JSON':'JSON ડાઉનલોડ','No backup snapshot yet. Click Backup Now.':'હજુ બેકઅપ નથી. હમણાં બેકઅપ દબાવો.','Backup created':'બેકઅપ બન્યું','Delete this backup?':'આ બેકઅપ ડિલીટ કરવો છે?','Cloud-ready:':'ક્લાઉડ માટે તૈયાર:','Cloudflare R2 Active':'Cloudflare R2 સક્રિય','D1 Fallback Active':'D1 ફૉલબૅક સક્રિય','R2 Cloud Storage Ready':'R2 ક્લાઉડ સ્ટોરેજ તૈયાર','D1 File Fallback':'D1 ફાઇલ ફૉલબૅક',
    'Notifications & App Alerts':'સૂચનાઓ અને App એલર્ટ','Enable Browser Alerts':'બ્રાઉઝર એલર્ટ ચાલુ કરો','ALL ALERTS':'બધી સૂચનાઓ','IMPORTANT':'મહત્વપૂર્ણ','FILE STORAGE':'ફાઇલ સ્ટોરેજ','Open ›':'ખોલો ›','No current alerts.':'હાલ કોઈ સૂચના નથી.','Showing current app data · refreshing online…':'હાલનો App ડેટા બતાવી રહ્યા છીએ · ઑનલાઇન રિફ્રેશ…','Party outstanding':'પાર્ટી બાકી','Supplier payment pending':'સપ્લાયર ચુકવણી બાકી','Expired':'સમાપ્ત','Free Trial':'મફત ટ્રાયલ','Subscription Expired':'સબ્સ્ક્રિપ્શન સમાપ્ત','Browser alerts enabled':'બ્રાઉઝર એલર્ટ ચાલુ થયા','important alert(s)':'મહત્વપૂર્ણ સૂચનાઓ','day(s) remaining':'દિવસ બાકી','day(s) left in Free Trial':'મફત ટ્રાયલના દિવસ બાકી',
    'TOTAL COMPANIES':'કુલ કંપનીઓ','ACTIVE':'સક્રિય','LIVE TRIALS':'ચાલુ ટ્રાયલ','EXPIRED':'સમાપ્ત','SUSPENDED':'સ્થગિત','PLAN REQUESTS':'પ્લાન વિનંતીઓ','Companies':'કંપનીઓ','This Month':'આ મહિનો','Support Action':'સહાય કાર્યવાહી','Subscription Requests':'સબ્સ્ક્રિપ્શન વિનંતીઓ','Requested Plan':'માગેલ પ્લાન','Cycle':'ચક્ર','Mark Reviewed':'તપાસ પૂર્ણ','Recent Platform Actions':'તાજેતરની પ્લેટફોર્મ કાર્યવાહી','No company found.':'કોઈ કંપની મળી નથી.','No subscription requests.':'કોઈ સબ્સ્ક્રિપ્શન વિનંતી નથી.','No platform actions yet.':'હજુ કોઈ પ્લેટફોર્મ કાર્યવાહી નથી.','Primary':'મુખ્ય','Suspend':'સ્થગિત કરો','Enable':'ચાલુ કરો','Plan':'પ્લાન',
    'transport trips':'ટ્રાન્સપોર્ટ ટ્રિપ્સ','invoices':'ઇન્વૉઇસ','payments':'ચુકવણીઓ','freight entries':'ભાડાની એન્ટ્રીઓ','PM bills':'PM બિલ','trucks':'ટ્રક','documents':'દસ્તાવેજો','docs':'દસ્તાવેજો','users':'યુઝર','user(s)':'યુઝર','Bills':'બિલ','bills':'બિલ','Trips/month':'ટ્રિપ/મહિનો','Invoices/month':'ઇન્વૉઇસ/મહિનો','bytes':'બાઇટ','days left':'દિવસ બાકી','documents uploaded':'દસ્તાવેજ અપલોડ થયા',
    'Supplier save thaya pachhi aa naam badha Supplier dropdown ma available thashe. Truck pachi pan link kari shako.':'સપ્લાયર સેવ થયા પછી આ નામ બધા સપ્લાયર dropdownમાં મળશે. ટ્રક પછી પણ જોડી શકશો.','Aa full supplier tab mathi Supplier, Truck, Mobile, Bank, Supplier Rate ane Commission badhu aa Trip sathe update thashe.':'આ સંપૂર્ણ સપ્લાયર વિભાગમાંથી સપ્લાયર, ટ્રક, મોબાઇલ, બૅન્ક, સપ્લાયર રેટ અને કમિશન આ ટ્રિપ સાથે અપડેટ થશે.','Supplier aa Trip Number sathe separately save ane edit thashe':'સપ્લાયર આ ટ્રિપ નંબર સાથે અલગથી સેવ અને સુધારી શકાશે','Truck Number ane Owner Name banne dropdown chhe. New Truck Add / New Supplier Add option dropdown ma j chhe.':'ટ્રક નંબર અને માલિકનું નામ બંને dropdown છે. નવો ટ્રક / નવો સપ્લાયર ઉમેરવાનો વિકલ્પ dropdownમાં જ છે.','Trip Type પ્રમાણે ML અથવા JAY series આવશે':'ટ્રિપ પ્રકાર પ્રમાણે ML અથવા JAY શ્રેણી આવશે','Party dropdownથી name અને address automatic આવશે':'પાર્ટી dropdownથી નામ અને સરનામું આપમેળે આવશે','બધી details editable છે':'બધી વિગતો સુધારી શકાય છે','બીજા office forms અહીં આગળ add કરી શકાશે.':'બીજા ઓફિસ ફોર્મ અહીં આગળ ઉમેરી શકાશે.','Darek query mate Solve button thi direct fix screen khulse':'દરેક સમસ્યા માટે ઉકેલો દબાવતાં સીધી સુધારાની સ્ક્રીન ખુલશે','Across devices save thase':'બધા ઉપકરણોમાં સેવ થશે','New entries mate default values':'નવી એન્ટ્રી માટે ડિફૉલ્ટ કિંમત','Pehla Supplier select karo. Pachhi aa Supplier na j Truck Number dropdown ma aavshe.':'પહેલા સપ્લાયર પસંદ કરો. પછી આ સપ્લાયરના જ ટ્રક નંબર dropdownમાં આવશે.','Supplier select karo.':'સપ્લાયર પસંદ કરો.','Owner / Supplier required.':'માલિક / સપ્લાયર જરૂરી છે.','Truck Number required.':'ટ્રક નંબર જરૂરી છે.','Supplier name required.':'સપ્લાયરનું નામ જરૂરી છે.'
  });

  Object.assign(HI,{
    'Receive':'रकम लें','Pay Supplier':'सप्लायर को भुगतान करें','Receive Payment':'पेमेंट प्राप्त करें','Receive Party Payment':'पार्टी पेमेंट प्राप्त करें','Save Receipt':'रसीद सेव करें','Save Payment':'पेमेंट सेव करें','Payment':'पेमेंट','Payments':'पेमेंट','Receipt':'रसीद','Reference':'रेफरेंस','Mode':'माध्यम','Owner':'मालिक','Trip':'ट्रिप','Bill':'बिल','Profit':'लाभ','Outstanding':'बकाया','Payable':'देय','Supplier Pending':'सप्लायर बकाया','Ledger View':'खाता देखें','Open Trip':'ट्रिप खोलें','Recent Entries':'हाल की एंट्री','Reports ›':'रिपोर्ट ›','Receive & invoice ledger':'प्राप्ति और इनवॉइस खाता','Payable & truck ledger':'देय और ट्रक खाता','Party Receipt':'पार्टी रसीद','Supplier Payment':'सप्लायर पेमेंट','Expense':'खर्च','Office Expense':'ऑफिस खर्च','Supplier:':'सप्लायर:','Driver:':'ड्राइवर:','Billed':'बिल किया','Advance/Credit':'एडवांस/क्रेडिट','No owner':'कोई मालिक नहीं','No GST':'GST नहीं','No ledger number':'खाता नंबर नहीं',
    'Create transport booking':'ट्रांसपोर्ट बुकिंग बनाएँ','Create GST invoice':'GST इनवॉइस बनाएँ','Party collection entry':'पार्टी से मिली रकम की एंट्री','Truck malik payment':'ट्रक मालिक को पेमेंट','BILTY VIEW':'बिल्टी दृश्य','No trips yet.':'अभी कोई ट्रिप नहीं है।','No trips found.':'कोई ट्रिप नहीं मिली।','No trips.':'कोई ट्रिप नहीं है।','No party outstanding.':'किसी पार्टी का बकाया नहीं है।','No outstanding.':'कोई बकाया नहीं है।','No invoices for this party.':'इस पार्टी का कोई इनवॉइस नहीं है।','No recent payment entries.':'हाल की कोई पेमेंट एंट्री नहीं है।','Search trip, party, truck…':'ट्रिप, पार्टी या ट्रक खोजें…','Search party or invoice…':'पार्टी या इनवॉइस खोजें…','Search payments…':'पेमेंट खोजें…','Search supplier or truck…':'सप्लायर या ट्रक खोजें…','Search supplier payments…':'सप्लायर पेमेंट खोजें…','Search entries…':'एंट्री खोजें…','Search truck or owner…':'ट्रक या मालिक खोजें…','Search document…':'दस्तावेज़ खोजें…',
    'Party Payment History':'पार्टी पेमेंट हिस्ट्री','Supplier Payment History':'सप्लायर पेमेंट हिस्ट्री','TransportBook-style receipt register':'पेमेंट रसीद रजिस्टर','Truck malik payment register':'ट्रक मालिक पेमेंट रजिस्टर','Freight payable per truck trip':'हर ट्रिप के अनुसार ट्रक भाड़ा देय','Truck Fleet':'ट्रक समूह','Truck Master':'ट्रक मास्टर','Owner and bank details':'मालिक और बैंक विवरण','Recent Documents':'हाल के दस्तावेज़','No documents.':'कोई दस्तावेज़ नहीं है।','No trucks found.':'कोई ट्रक नहीं मिला।','No truck linked':'कोई ट्रक जुड़ा नहीं है','No truck documents.':'ट्रक का कोई दस्तावेज़ नहीं है।','No vehicle linked yet.':'अभी कोई वाहन जुड़ा नहीं है।','documents & owners':'दस्तावेज़ और मालिक','Document Type':'दस्तावेज़ प्रकार','Expiry Date':'समाप्ति तारीख','Image / PDF':'इमेज / PDF','Images / PDFs (multiple)':'इमेज / PDF (एक से अधिक)','Upload Document':'दस्तावेज़ अपलोड करें','Upload All':'सभी अपलोड करें','Upload Multiple Truck Documents':'ट्रक के कई दस्तावेज़ अपलोड करें','Truck Documents Gallery':'ट्रक दस्तावेज़ गैलरी','All Trucks':'सभी ट्रक','Add Another Truck':'एक और ट्रक जोड़ें','DOC +':'दस्तावेज़ +',
    'New Party':'नई पार्टी','New Entry':'नई एंट्री','New PM Bill':'नया PM बिल','PM Non-GST Bills':'PM Non-GST बिल','Total PM Billing':'कुल PM बिलिंग','PM Profit':'PM लाभ','Party Bill':'पार्टी बिल','Supplier':'सप्लायर','Truck':'ट्रक','Trip / Ref':'ट्रिप / रेफरेंस','Route / Detail':'रूट / विवरण','Weight × Rate':'वज़न × रेट','Bill No.':'बिल नं.','Invoice No.':'इनवॉइस नं.','Payment Date':'पेमेंट तारीख','Payment Mode':'पेमेंट माध्यम','Owner / Supplier':'मालिक / सप्लायर','Owner Mobile':'मालिक का मोबाइल','Material Name':'मटेरियल का नाम','Party GST':'पार्टी GST','Party GST Number':'पार्टी GST नंबर','Party Address':'पार्टी का पता','Party Billing Rate':'पार्टी बिलिंग रेट','Party Rate':'पार्टी रेट','Party Amount':'पार्टी राशि','Supplier Rate':'सप्लायर रेट','Supplier Advance':'सप्लायर एडवांस','Supplier Vehicles':'सप्लायर वाहन','Supplier / Truck Malik Name':'सप्लायर / ट्रक मालिक का नाम','Supplier / Truck Malik':'सप्लायर / ट्रक मालिक','Supplier / Truck':'सप्लायर / ट्रक','Save Supplier & Truck':'सप्लायर और ट्रक सेव करें','Edit Supplier':'सप्लायर सुधारें','Edit Supplier & Truck':'सप्लायर और ट्रक सुधारें','New Truck Add':'नया ट्रक जोड़ें','New Supplier Add':'नया सप्लायर जोड़ें','Payer / Party':'भुगतानकर्ता / पार्टी','Payer Address':'भुगतानकर्ता का पता',
    'Add':'जोड़ें','Remove':'हटाएँ','Complete':'पूरा करें','Create Bill':'बिल बनाएँ','Create / Update Invoice With This Trip':'इस ट्रिप से इनवॉइस बनाएँ / अपडेट करें','Add Party Payment':'पार्टी पेमेंट जोड़ें','Add Supplier Payment':'सप्लायर पेमेंट जोड़ें','Add Expense':'खर्च जोड़ें','Edit Universal Trip':'ट्रिप सुधारें','Trip Details':'ट्रिप विवरण','TRIP DETAILS':'ट्रिप विवरण','Trip Date':'ट्रिप तारीख','Loading Date':'लोडिंग तारीख','Trip Type':'ट्रिप प्रकार','Trip Freight Amount':'ट्रिप भाड़ा राशि','Freight Amount':'भाड़ा राशि','LR Number':'LR नंबर','Driver Name':'ड्राइवर का नाम','Driver Mobile':'ड्राइवर मोबाइल','Comments / Payment Terms':'टिप्पणी / पेमेंट शर्तें','Invoice Allocation':'इनवॉइस आवंटन','Party Advance / Auto FIFO':'पार्टी एडवांस / ऑटो FIFO','Select Supplier First':'पहले सप्लायर चुनें','Select Truck':'ट्रक चुनें','Select':'चुनें','Enter new Value':'नई वैल्यू डालें',
    'Party Master':'पार्टी मास्टर','Material Master':'मटेरियल मास्टर','TDS Declaration':'TDS घोषणा','TDS Declaration Form':'TDS घोषणा फॉर्म','TDS Declaration Preview':'TDS घोषणा प्रीव्यू','Create Form':'फॉर्म बनाएँ','More Forms':'और फॉर्म','PAYER DETAILS':'भुगतानकर्ता विवरण','MEERA LOGISTICS DETAILS':'MEERA LOGISTICS विवरण','Entity Type':'इकाई प्रकार','Firm Name':'फर्म का नाम','Firm PAN':'फर्म PAN','Firm GST Number':'फर्म GST नंबर','Phone':'फोन','Firm Address':'फर्म का पता','Authorized Partner':'अधिकृत भागीदार','Authorized Partner Name':'अधिकृत भागीदार का नाम','Place':'स्थान','Financial Year':'वित्तीय वर्ष','Maximum Goods Carriages':'अधिकतम मालवाहक वाहन','Print / Save PDF':'प्रिंट / PDF सेव करें','More office forms can be added here later.':'बाद में यहाँ और ऑफिस फॉर्म जोड़े जा सकते हैं।',
    'Accounting Allocation V66.5':'हिसाब आवंटन V66.5','Exact invoice receipts + locked one-time allocation for old receipts':'सटीक इनवॉइस प्राप्ति और पुरानी प्राप्ति का सुरक्षित एकमुश्त आवंटन','Legacy FIFO:':'पुराना FIFO:','Unallocated Credit:':'बिना आवंटन का क्रेडिट:','Invoice Pending:':'इनवॉइस बकाया:','Run Full Accounting Audit':'पूरा हिसाब ऑडिट चलाएँ','Audit Alerts':'ऑडिट सूचनाएँ','Restore Backup':'बैकअप रीस्टोर करें','No accounting/data-isolation issue detected.':'हिसाब या डेटा अलगाव की कोई समस्या नहीं मिली।','Accounting isolation checks passed':'हिसाब अलगाव जाँच सफल','Audit needs attention':'ऑडिट पर ध्यान चाहिए','Billing':'बिलिंग','Checked':'जाँच की','Company':'कंपनी','Cross-company links':'दूसरी कंपनी से लिंक','errors':'त्रुटियाँ','warnings':'चेतावनियाँ',
    'Smart Tools':'स्मार्ट टूल्स','Meera Logistics Smart Operations':'Meera Logistics स्मार्ट ऑपरेशन','Booking Workflow':'बुकिंग प्रक्रिया','Approvals':'मंज़ूरियाँ','Recycle Bin':'रीसायकल बिन','Super Admin':'सुपर एडमिन','Trips, bookings, invoices and expiry dates':'ट्रिप, बुकिंग, इनवॉइस और समाप्ति तारीखें','Outstanding, supplier pending, expiry, approvals and trial alerts':'पार्टी बकाया, सप्लायर बकाया, समाप्ति, मंज़ूरी और ट्रायल सूचनाएँ','Booking → Approval → Dispatch → Trip':'बुकिंग → मंज़ूरी → डिस्पैच → ट्रिप','Pending booking approvals':'बाकी बुकिंग मंज़ूरियाँ','Restore deleted records safely':'डिलीट रिकॉर्ड सुरक्षित वापस लाएँ','Database and ledger diagnostics':'डेटाबेस और खाते की जाँच','Full export, import and monthly files':'पूरा एक्सपोर्ट, इम्पोर्ट और मासिक फाइलें','Daily Cloudflare backup snapshots':'रोज़ का Cloudflare बैकअप','Multiple document images per truck':'हर ट्रक के कई दस्तावेज़ इमेज','Company profile, subscription and usage':'कंपनी प्रोफाइल, सब्सक्रिप्शन और उपयोग','Owner, Admin, Accountant, Operator and Viewer':'Owner, Admin, Accountant, Operator और Viewer','Company details, interface and backup defaults':'कंपनी विवरण, इंटरफेस और बैकअप डिफ़ॉल्ट','Command Palette':'कमांड पैलेट','Type command, invoice, trip, party, truck…':'कमांड, इनवॉइस, ट्रिप, पार्टी या ट्रक लिखें…','No matching invoice, trip, party, supplier or truck found.':'मिलता हुआ इनवॉइस, ट्रिप, पार्टी, सप्लायर या ट्रक नहीं मिला।',
    'Company & Subscription':'कंपनी और सब्सक्रिप्शन','Company Profile':'कंपनी प्रोफाइल','Legal Name':'कानूनी नाम','PAN Number':'PAN नंबर','GST Invoice Prefix':'GST इनवॉइस प्रिफिक्स','Non-GST Prefix':'Non-GST प्रिफिक्स','Trip Prefix':'ट्रिप प्रिफिक्स','Supplier Prefix':'सप्लायर प्रिफिक्स','Save Company':'कंपनी सेव करें','Subscription Plans':'सब्सक्रिप्शन प्लान','Current Plan':'वर्तमान प्लान','CURRENT PLAN':'वर्तमान प्लान','YOUR ROLE':'आपकी भूमिका','THIS MONTH':'इस महीने','COMPANY':'कंपनी','Read Only Mode':'केवल पढ़ने का मोड','14-Day Trial':'14 दिन का ट्रायल','Plan request pending':'प्लान अनुरोध बाकी','Billing status:':'बिलिंग स्थिति:','Trial only':'केवल ट्रायल','Request Pending':'अनुरोध बाकी','Price via Play Billing':'Play Billing से कीमत','Full access':'पूरा एक्सेस','Limited access':'सीमित एक्सेस',
    'Add Staff Login':'स्टाफ लॉगिन जोड़ें','Full Name':'पूरा नाम','Role':'भूमिका','Temporary Password':'अस्थायी पासवर्ड','Create Staff Login':'स्टाफ लॉगिन बनाएँ','Edit Staff Access':'स्टाफ एक्सेस सुधारें','Save Access':'एक्सेस सेव करें','New Password (optional)':'नया पासवर्ड (वैकल्पिक)','Active':'सक्रिय','Disabled':'बंद','No team users':'कोई टीम यूज़र नहीं','Owner/Admin only':'केवल Owner/Admin','Staff login created':'स्टाफ लॉगिन बना','Staff access updated':'स्टाफ एक्सेस अपडेट हुआ','Company profile saved':'कंपनी प्रोफाइल सेव हुई','Plan request submitted':'प्लान अनुरोध भेजा गया',
    'Company Settings':'कंपनी सेटिंग्स','Invoice Defaults':'इनवॉइस डिफ़ॉल्ट','Interface & Safety':'इंटरफेस और सुरक्षा','Interface Density':'इंटरफेस घनत्व','Comfortable':'आरामदायक','Compact':'कॉम्पैक्ट','Default SGST %':'डिफ़ॉल्ट SGST %','Default CGST %':'डिफ़ॉल्ट CGST %','Default Payment Terms':'डिफ़ॉल्ट पेमेंट शर्तें','Settings saved':'सेटिंग्स सेव हुईं','Default settings restored':'डिफ़ॉल्ट सेटिंग्स वापस आईं','Offline · Changes queued':'ऑफलाइन · बदलाव कतार में','Online — offline changes syncing':'ऑनलाइन — ऑफलाइन बदलाव सिंक हो रहे हैं','Changes queued':'बदलाव कतार में',
    'Professional Calendar':'व्यावसायिक कैलेंडर','Booking':'बुकिंग','Bookings':'बुकिंग','Expiry':'समाप्ति','Document expiry':'दस्तावेज़ समाप्ति','more':'और','New Booking':'नई बुकिंग','Edit Booking':'बुकिंग सुधारें','Booking Date':'बुकिंग तारीख','Expected Delivery':'अपेक्षित डिलीवरी','Save Booking':'बुकिंग सेव करें','Send Approval':'मंज़ूरी के लिए भेजें','Dispatch':'डिस्पैच','Create Trip':'ट्रिप बनाएँ','Booking saved':'बुकिंग सेव हुई','Approval Queue':'मंज़ूरी कतार','Approve':'मंज़ूर करें','Reject':'अस्वीकार करें','No approval requests.':'कोई मंज़ूरी अनुरोध नहीं है।','Recycle Bin is empty.':'रीसायकल बिन खाली है।','Delete Forever':'हमेशा के लिए डिलीट','System Health Dashboard':'सिस्टम हेल्थ डैशबोर्ड','Database Records':'डेटाबेस रिकॉर्ड','HEALTHY':'स्वस्थ','ATTENTION':'ध्यान दें',
    'Excel Import / Export Center':'Excel इम्पोर्ट / एक्सपोर्ट सेंटर','Full Excel Export':'पूरा Excel एक्सपोर्ट','Full Excel Import':'पूरा Excel इम्पोर्ट','Monthly Excel Generation':'मासिक Excel बनाएँ','Import':'इम्पोर्ट','No monthly files generated yet.':'अभी कोई मासिक फाइल नहीं बनी।','Select Excel/CSV/JSON file.':'Excel/CSV/JSON फाइल चुनें।','Excel import complete':'Excel इम्पोर्ट पूरा','Monthly Excel generated':'मासिक Excel बन गया','Automatic daily backup':'ऑटोमेटिक दैनिक बैकअप','Download JSON':'JSON डाउनलोड','No backup snapshot yet. Click Backup Now.':'अभी बैकअप नहीं है। अभी बैकअप दबाएँ।','Backup created':'बैकअप बना','Delete this backup?':'यह बैकअप डिलीट करें?','Cloud-ready:':'क्लाउड के लिए तैयार:','Cloudflare R2 Active':'Cloudflare R2 सक्रिय','D1 Fallback Active':'D1 फॉलबैक सक्रिय','R2 Cloud Storage Ready':'R2 क्लाउड स्टोरेज तैयार','D1 File Fallback':'D1 फाइल फॉलबैक',
    'Notifications & App Alerts':'सूचनाएँ और ऐप अलर्ट','Enable Browser Alerts':'ब्राउज़र अलर्ट चालू करें','ALL ALERTS':'सभी सूचनाएँ','IMPORTANT':'महत्वपूर्ण','FILE STORAGE':'फाइल स्टोरेज','Open ›':'खोलें ›','No current alerts.':'अभी कोई सूचना नहीं है।','Showing current app data · refreshing online…':'वर्तमान ऐप डेटा दिख रहा है · ऑनलाइन रिफ्रेश…','Party outstanding':'पार्टी बकाया','Supplier payment pending':'सप्लायर पेमेंट बाकी','Expired':'समाप्त','Free Trial':'मुफ्त ट्रायल','Subscription Expired':'सब्सक्रिप्शन समाप्त','Browser alerts enabled':'ब्राउज़र अलर्ट चालू हुए','important alert(s)':'महत्वपूर्ण सूचनाएँ','day(s) remaining':'दिन बाकी','day(s) left in Free Trial':'मुफ्त ट्रायल के दिन बाकी',
    'TOTAL COMPANIES':'कुल कंपनियाँ','ACTIVE':'सक्रिय','LIVE TRIALS':'चल रहे ट्रायल','EXPIRED':'समाप्त','SUSPENDED':'निलंबित','PLAN REQUESTS':'प्लान अनुरोध','Companies':'कंपनियाँ','This Month':'इस महीने','Support Action':'सहायता कार्रवाई','Subscription Requests':'सब्सक्रिप्शन अनुरोध','Requested Plan':'माँगा गया प्लान','Cycle':'चक्र','Mark Reviewed':'जाँच पूरी','Recent Platform Actions':'हाल की प्लेटफॉर्म कार्रवाई','No company found.':'कोई कंपनी नहीं मिली।','No subscription requests.':'कोई सब्सक्रिप्शन अनुरोध नहीं है।','No platform actions yet.':'अभी कोई प्लेटफॉर्म कार्रवाई नहीं है।','Primary':'मुख्य','Suspend':'निलंबित करें','Enable':'चालू करें','Plan':'प्लान',
    'transport trips':'ट्रांसपोर्ट ट्रिप्स','invoices':'इनवॉइस','payments':'पेमेंट','freight entries':'भाड़ा एंट्री','PM bills':'PM बिल','trucks':'ट्रक','documents':'दस्तावेज़','docs':'दस्तावेज़','users':'यूज़र','user(s)':'यूज़र','Bills':'बिल','bills':'बिल','Trips/month':'ट्रिप/महीना','Invoices/month':'इनवॉइस/महीना','bytes':'बाइट','days left':'दिन बाकी','documents uploaded':'दस्तावेज़ अपलोड हुए',
    'Supplier save thaya pachhi aa naam badha Supplier dropdown ma available thashe. Truck pachi pan link kari shako.':'सप्लायर सेव होने के बाद यह नाम सभी सप्लायर dropdown में मिलेगा। ट्रक बाद में भी जोड़ सकते हैं।','Aa full supplier tab mathi Supplier, Truck, Mobile, Bank, Supplier Rate ane Commission badhu aa Trip sathe update thashe.':'इस पूरे सप्लायर विभाग से सप्लायर, ट्रक, मोबाइल, बैंक, सप्लायर रेट और कमीशन इस ट्रिप के साथ अपडेट होंगे।','Supplier aa Trip Number sathe separately save ane edit thashe':'सप्लायर इस ट्रिप नंबर के साथ अलग सेव और एडिट होगा','Truck Number ane Owner Name banne dropdown chhe. New Truck Add / New Supplier Add option dropdown ma j chhe.':'ट्रक नंबर और मालिक का नाम दोनों dropdown हैं। नया ट्रक / नया सप्लायर जोड़ने का विकल्प dropdown में है।','Trip Type પ્રમાણે ML અથવા JAY series આવશે':'ट्रिप प्रकार के अनुसार ML या JAY सीरीज़ आएगी','Party dropdownથી name અને address automatic આવશે':'पार्टी dropdown से नाम और पता अपने आप आएगा','બધી details editable છે':'सभी विवरण बदले जा सकते हैं','બીજા office forms અહીં આગળ add કરી શકાશે.':'बाद में यहाँ और ऑफिस फॉर्म जोड़े जा सकते हैं।','Darek query mate Solve button thi direct fix screen khulse':'हर समस्या के लिए हल दबाने पर सीधी सुधार स्क्रीन खुलेगी','Across devices save thase':'सभी डिवाइस में सेव होगा','New entries mate default values':'नई एंट्री के लिए डिफ़ॉल्ट वैल्यू','Pehla Supplier select karo. Pachhi aa Supplier na j Truck Number dropdown ma aavshe.':'पहले सप्लायर चुनें। फिर उसी सप्लायर के ट्रक नंबर dropdown में आएँगे।','Supplier select karo.':'सप्लायर चुनें।','Owner / Supplier required.':'मालिक / सप्लायर जरूरी है।','Truck Number required.':'ट्रक नंबर जरूरी है।','Supplier name required.':'सप्लायर का नाम जरूरी है।'
  });

  Object.assign(GU,{
    '· Bilty':'· બિલ્ટી','· Khata':'· ખાતું','14-day Free Trial':'14 દિવસની મફત ટ્રાયલ','14-day free trial':'14 દિવસની મફત ટ્રાયલ','No card required':'કાર્ડ જરૂરી નથી','No card required for trial':'ટ્રાયલ માટે કાર્ડ જરૂરી નથી','Your company data stays isolated':'તમારી કંપનીનો ડેટા અલગ અને સુરક્ષિત રહે છે','Your company gets its own isolated workspace.':'તમારી કંપનીને અલગ અને સુરક્ષિત workspace મળે છે.','Your company data stays isolated':'તમારી કંપનીનો ડેટા અલગ રહે છે','This becomes the OWNER account.':'આ OWNER ખાતું બનશે.','This company workspace is isolated from every other transporter.':'આ કંપનીનું workspace બીજા દરેક ટ્રાન્સપોર્ટરથી અલગ છે.','I understand the trial is limited by plan usage and becomes read-only after expiry until subscription is renewed.':'હું સમજું છું કે ટ્રાયલમાં પ્લાન મુજબ મર્યાદા છે અને સમય પૂરો થયા પછી સબ્સ્ક્રિપ્શન રિન્યૂ ન થાય ત્યાં સુધી માત્ર વાંચી શકાશે.','Transport':'ટ્રાન્સપોર્ટ','made simple.':'સરળ બનાવ્યું.','Trips, invoices, party khata, supplier khata, payments, documents અને profit — ek secure Transport ERP ma.':'ટ્રિપ, ઇન્વૉઇસ, પાર્ટી ખાતું, સપ્લાયર ખાતું, ચુકવણી, દસ્તાવેજ અને નફો — એક સુરક્ષિત Transport ERPમાં.','1 · Company Details':'1 · કંપનીની વિગત','2 · Secure Login':'2 · સુરક્ષિત લૉગિન',
    'Balance Pending':'બાકી બેલેન્સ','Pending Balance':'બાકી બેલેન્સ','Closing Balance':'અંતિમ બેલેન્સ','Bill To':'બિલ મેળવનાર','Charges':'ચાર્જ','Deduction':'કપાત','Diesel':'ડીઝલ','Munshi':'મુનશી','Munshi Charges':'મુનશી ચાર્જ','Comments':'ટિપ્પણી','Invoice Type':'ઇન્વૉઇસ પ્રકાર','Edit Invoice':'ઇન્વૉઇસ સુધારો','Non-GST Invoice':'Non-GST ઇન્વૉઇસ','GST Invoice':'GST ઇન્વૉઇસ','Non-GST Trip':'Non-GST ટ્રિપ','GST Trip':'GST ટ્રિપ','Materials':'મટીરિયલ','Expenses':'ખર્ચ','Name':'નામ','Particulars':'વિગત','Ledger Account':'ખાતાવહી','Party Ledger':'પાર્ટી ખાતાવહી','Supplier Ledger':'સપ્લાયર ખાતાવહી','Loading ledger…':'ખાતું લોડ થઈ રહ્યું છે…','Loading supplier ledger…':'સપ્લાયર ખાતું લોડ થઈ રહ્યું છે…','Preparing...':'તૈયાર થઈ રહ્યું છે...','Preparing exact invoice preview…':'ચોક્કસ ઇન્વૉઇસ પ્રીવ્યૂ તૈયાર થઈ રહ્યું છે…','PDF / Print':'PDF / પ્રિન્ટ','PDF preview could not load.':'PDF પ્રીવ્યૂ લોડ થઈ શક્યું નહીં.','View Bill':'બિલ જુઓ','View LR with complete trip details':'સંપૂર્ણ ટ્રિપ વિગત સાથે LR જુઓ','Online Bilty / LR':'ઑનલાઇન બિલ્ટી / LR','Online Bilty / LR · Trip linked details':'ઑનલાઇન બિલ્ટી / LR · ટ્રિપ સાથે જોડાયેલી વિગત','Truck Details':'ટ્રકની વિગત','Truck Hire Cost':'ટ્રક ભાડાનો ખર્ચ','Truck No / Supplier':'ટ્રક નં. / સપ્લાયર','Total Due':'કુલ ચૂકવવાનું','Total Due :':'કુલ ચૂકવવાનું :','Save Expense':'ખર્ચ સેવ કરો','Save Material':'મટીરિયલ સેવ કરો','Save Party':'પાર્ટી સેવ કરો','Save Route':'રૂટ સેવ કરો','View Plan':'પ્લાન જુઓ','System':'સિસ્ટમ','Reports':'રિપોર્ટ','Ledgers':'ખાતાં','Excel':'Excel','User':'યુઝર','Invoices/month':'ઇન્વૉઇસ/મહિનો','Trips/month':'ટ્રિપ/મહિનો',
    'Calendar, booking, approval, backup & health':'કૅલેન્ડર, બુકિંગ, મંજૂરી, બેકઅપ અને હેલ્થ','Company and interface defaults':'કંપની અને ઇન્ટરફેસ ડિફૉલ્ટ','Billing safety:':'બિલિંગ સુરક્ષા:','Platform-level company, trial and subscription support controls.':'પ્લેટફોર્મ સ્તરની કંપની, ટ્રાયલ અને સબ્સ્ક્રિપ્શન સહાય નિયંત્રણ.','Super Admin activity log':'સુપર એડમિન પ્રવૃત્તિ લૉગ','Transport ERP · Super Admin':'Transport ERP · સુપર એડમિન','Search company, owner, mobile or plan…':'કંપની, માલિક, મોબાઇલ અથવા પ્લાન શોધો…','Search PM bills…':'PM બિલ શોધો…','Search, suspend/enable and extend Trial. Meera Logistics primary company is protected.':'કંપની શોધો, સ્થગિત/ચાલુ કરો અને ટ્રાયલ વધારો. Meera Logisticsની મુખ્ય કંપની સુરક્ષિત છે.','Review support requests. Paid plan is NOT activated here; Google Play purchase verification remains required.':'સહાય વિનંતીઓ તપાસો. અહીં paid plan સક્રિય થતો નથી; Google Play purchase verification જરૂરી છે.','Usage limits are enforced now. Paid purchase activation will connect to Google Play Billing in the Android billing phase.':'ઉપયોગ મર્યાદા લાગુ છે. Android billing તબક્કામાં paid purchase Google Play Billing સાથે જોડાશે.','Plan limits, expiry and read-only mode are live. Plan request does not activate paid access by itself; secure Google Play purchase verification will activate it later.':'પ્લાન મર્યાદા, સમાપ્તિ અને read-only mode કાર્યરત છે. માત્ર વિનંતીથી paid access શરૂ થતું નથી; સુરક્ષિત Google Play verification પછી તે ચાલુ થશે.','V60 can review plan requests, suspend/enable companies and extend trials. It deliberately cannot grant a paid plan without verified Google Play Billing.':'V60 પ્લાન વિનંતી તપાસી, કંપની સ્થગિત/ચાલુ અને ટ્રાયલ વધારી શકે છે. Google Play Billing ચકાસણી વગર paid plan આપી શકાતો નથી.',
    'Party, supplier, truck and profit history — GST વગર':'પાર્ટી, સપ્લાયર, ટ્રક અને નફાની હિસ્ટ્રી — GST વગર','Party, Truck, Trip, Invoice, Payments, Expenses ane Booking badha sheets sathe.':'પાર્ટી, ટ્રક, ટ્રિપ, ઇન્વૉઇસ, ચુકવણી, ખર્ચ અને બુકિંગની બધી sheet સાથે.','V43 export kareli .xls, CSV athva JSON backup merge karo.':'V43થી export કરેલી .xls, CSV અથવા JSON backup merge કરો.','R2 binding active hoy to files directly cloud storage ma jai. D1 fallback ma large files automatically reject thase.':'R2 binding સક્રિય હોય તો file સીધી cloud storageમાં જશે. D1 fallbackમાં મોટી file આપમેળે નકારાશે.','No supplier found.':'કોઈ સપ્લાયર મળ્યો નથી.','No supplier ledger entries yet.':'હજુ સપ્લાયર ખાતામાં કોઈ એન્ટ્રી નથી.','No ledger transactions found.':'ખાતામાં કોઈ વ્યવહાર મળ્યો નથી.','No supplier ledger transactions found.':'સપ્લાયર ખાતામાં કોઈ વ્યવહાર મળ્યો નથી.','Unable to load Party Ledger.':'પાર્ટી ખાતું લોડ થઈ શક્યું નહીં.','Unable to download Party Ledger.':'પાર્ટી ખાતું ડાઉનલોડ થઈ શક્યું નહીં.','Unable to load Supplier Ledger.':'સપ્લાયર ખાતું લોડ થઈ શક્યું નહીં.','Unable to download Supplier Ledger.':'સપ્લાયર ખાતું ડાઉનલોડ થઈ શક્યું નહીં.','Unable to save file.':'ફાઇલ સેવ થઈ શકી નહીં.','Unable to prepare file':'ફાઇલ તૈયાર થઈ શકી નહીં','Android file storage is unavailable':'Android file storage ઉપલબ્ધ નથી','Android sharing is unavailable':'Android sharing ઉપલબ્ધ નથી','Save or share file':'ફાઇલ સેવ અથવા શેર કરો','Share file':'ફાઇલ શેર કરો',
    'એક invoiceમાં જેટલી truck જોઈએ એટલી add કરો':'એક ઇન્વૉઇસમાં જરૂરી એટલા ટ્રક ઉમેરો','એક જ entryમાંથી Trip, Invoice, Party અને Supplier બધે લાગુ પડશે':'એક જ એન્ટ્રીમાંથી ટ્રિપ, ઇન્વૉઇસ, પાર્ટી અને સપ્લાયર બધે લાગુ પડશે','આ Truck / Trip માટે અલગ supplier payment details':'આ ટ્રક / ટ્રિપ માટે અલગ સપ્લાયર ચુકવણી વિગત','Invoice select karsho to payment exact e invoice sathe link thashe. Blank rakhsho to old pending invoices ma FIFO allocation thashe.':'ઇન્વૉઇસ પસંદ કરશો તો ચુકવણી ચોક્કસ એ ઇન્વૉઇસ સાથે જોડાશે. ખાલી રાખશો તો જૂના બાકી ઇન્વૉઇસમાં FIFO ફાળવણી થશે.','Command Palette:':'કમાન્ડ પેલેટ:','keyboard par':'કીબોર્ડ પર','Loading…':'લોડ થઈ રહ્યું છે…','Upload Documents':'દસ્તાવેજ અપલોડ કરો','Smart Operations':'સ્માર્ટ કામગીરી','Alerts':'સૂચનાઓ'
  });
  Object.assign(HI,{
    '· Bilty':'· बिल्टी','· Khata':'· खाता','14-day Free Trial':'14 दिन का मुफ्त ट्रायल','14-day free trial':'14 दिन का मुफ्त ट्रायल','No card required':'कार्ड जरूरी नहीं','No card required for trial':'ट्रायल के लिए कार्ड जरूरी नहीं','Your company data stays isolated':'आपकी कंपनी का डेटा अलग और सुरक्षित रहता है','Your company gets its own isolated workspace.':'आपकी कंपनी को अलग और सुरक्षित workspace मिलता है।','This becomes the OWNER account.':'यह OWNER खाता बनेगा।','This company workspace is isolated from every other transporter.':'इस कंपनी का workspace हर दूसरे ट्रांसपोर्टर से अलग है।','I understand the trial is limited by plan usage and becomes read-only after expiry until subscription is renewed.':'मैं समझता हूँ कि ट्रायल में प्लान के अनुसार सीमा है और समय पूरा होने के बाद सब्सक्रिप्शन रिन्यू होने तक केवल पढ़ा जा सकेगा।','Transport':'ट्रांसपोर्ट','made simple.':'आसान बनाया।','Trips, invoices, party khata, supplier khata, payments, documents અને profit — ek secure Transport ERP ma.':'ट्रिप, इनवॉइस, पार्टी खाता, सप्लायर खाता, पेमेंट, दस्तावेज़ और लाभ — एक सुरक्षित Transport ERP में।','1 · Company Details':'1 · कंपनी विवरण','2 · Secure Login':'2 · सुरक्षित लॉगिन',
    'Balance Pending':'बाकी बैलेंस','Pending Balance':'बाकी बैलेंस','Closing Balance':'अंतिम बैलेंस','Bill To':'बिल पाने वाला','Charges':'चार्ज','Deduction':'कटौती','Diesel':'डीज़ल','Munshi':'मुंशी','Munshi Charges':'मुंशी चार्ज','Comments':'टिप्पणी','Invoice Type':'इनवॉइस प्रकार','Edit Invoice':'इनवॉइस सुधारें','Non-GST Invoice':'Non-GST इनवॉइस','GST Invoice':'GST इनवॉइस','Non-GST Trip':'Non-GST ट्रिप','GST Trip':'GST ट्रिप','Materials':'मटेरियल','Expenses':'खर्च','Name':'नाम','Particulars':'विवरण','Ledger Account':'खाताबही','Party Ledger':'पार्टी खाताबही','Supplier Ledger':'सप्लायर खाताबही','Loading ledger…':'खाता लोड हो रहा है…','Loading supplier ledger…':'सप्लायर खाता लोड हो रहा है…','Preparing...':'तैयार हो रहा है...','Preparing exact invoice preview…':'सटीक इनवॉइस प्रीव्यू तैयार हो रहा है…','PDF / Print':'PDF / प्रिंट','PDF preview could not load.':'PDF प्रीव्यू लोड नहीं हुआ।','View Bill':'बिल देखें','View LR with complete trip details':'पूरे ट्रिप विवरण के साथ LR देखें','Online Bilty / LR':'ऑनलाइन बिल्टी / LR','Online Bilty / LR · Trip linked details':'ऑनलाइन बिल्टी / LR · ट्रिप से जुड़ा विवरण','Truck Details':'ट्रक विवरण','Truck Hire Cost':'ट्रक भाड़ा खर्च','Truck No / Supplier':'ट्रक नं. / सप्लायर','Total Due':'कुल देय','Total Due :':'कुल देय :','Save Expense':'खर्च सेव करें','Save Material':'मटेरियल सेव करें','Save Party':'पार्टी सेव करें','Save Route':'रूट सेव करें','View Plan':'प्लान देखें','System':'सिस्टम','Reports':'रिपोर्ट','Ledgers':'खाते','Excel':'Excel','User':'यूज़र','Invoices/month':'इनवॉइस/महीना','Trips/month':'ट्रिप/महीना',
    'Calendar, booking, approval, backup & health':'कैलेंडर, बुकिंग, मंज़ूरी, बैकअप और हेल्थ','Company and interface defaults':'कंपनी और इंटरफेस डिफ़ॉल्ट','Billing safety:':'बिलिंग सुरक्षा:','Platform-level company, trial and subscription support controls.':'प्लेटफॉर्म स्तर की कंपनी, ट्रायल और सब्सक्रिप्शन सहायता नियंत्रण।','Super Admin activity log':'सुपर एडमिन गतिविधि लॉग','Transport ERP · Super Admin':'Transport ERP · सुपर एडमिन','Search company, owner, mobile or plan…':'कंपनी, मालिक, मोबाइल या प्लान खोजें…','Search PM bills…':'PM बिल खोजें…','Search, suspend/enable and extend Trial. Meera Logistics primary company is protected.':'कंपनी खोजें, निलंबित/चालू करें और ट्रायल बढ़ाएँ। Meera Logistics की मुख्य कंपनी सुरक्षित है।','Review support requests. Paid plan is NOT activated here; Google Play purchase verification remains required.':'सहायता अनुरोध जाँचें। यहाँ paid plan सक्रिय नहीं होता; Google Play purchase verification जरूरी है।','Usage limits are enforced now. Paid purchase activation will connect to Google Play Billing in the Android billing phase.':'उपयोग सीमा लागू है। Android billing चरण में paid purchase Google Play Billing से जुड़ेगा।','Plan limits, expiry and read-only mode are live. Plan request does not activate paid access by itself; secure Google Play purchase verification will activate it later.':'प्लान सीमा, समाप्ति और read-only mode चालू हैं। केवल अनुरोध से paid access शुरू नहीं होता; सुरक्षित Google Play verification बाद में इसे चालू करेगा।','V60 can review plan requests, suspend/enable companies and extend trials. It deliberately cannot grant a paid plan without verified Google Play Billing.':'V60 प्लान अनुरोध जाँच सकता है, कंपनी निलंबित/चालू कर सकता है और ट्रायल बढ़ा सकता है। Google Play Billing सत्यापन के बिना paid plan नहीं दिया जा सकता।',
    'Party, supplier, truck and profit history — GST વગર':'पार्टी, सप्लायर, ट्रक और लाभ हिस्ट्री — GST के बिना','Party, Truck, Trip, Invoice, Payments, Expenses ane Booking badha sheets sathe.':'पार्टी, ट्रक, ट्रिप, इनवॉइस, पेमेंट, खर्च और बुकिंग की सभी sheet के साथ।','V43 export kareli .xls, CSV athva JSON backup merge karo.':'V43 से export की गई .xls, CSV या JSON backup merge करें।','R2 binding active hoy to files directly cloud storage ma jai. D1 fallback ma large files automatically reject thase.':'R2 binding सक्रिय हो तो file सीधे cloud storage में जाएगी। D1 fallback में बड़ी file अपने आप अस्वीकार होगी।','No supplier found.':'कोई सप्लायर नहीं मिला।','No supplier ledger entries yet.':'अभी सप्लायर खाते में कोई एंट्री नहीं है।','No ledger transactions found.':'खाते में कोई लेनदेन नहीं मिला।','No supplier ledger transactions found.':'सप्लायर खाते में कोई लेनदेन नहीं मिला।','Unable to load Party Ledger.':'पार्टी खाता लोड नहीं हुआ।','Unable to download Party Ledger.':'पार्टी खाता डाउनलोड नहीं हुआ।','Unable to load Supplier Ledger.':'सप्लायर खाता लोड नहीं हुआ।','Unable to download Supplier Ledger.':'सप्लायर खाता डाउनलोड नहीं हुआ।','Unable to save file.':'फाइल सेव नहीं हुई।','Unable to prepare file':'फाइल तैयार नहीं हुई','Android file storage is unavailable':'Android file storage उपलब्ध नहीं है','Android sharing is unavailable':'Android sharing उपलब्ध नहीं है','Save or share file':'फाइल सेव या शेयर करें','Share file':'फाइल शेयर करें',
    'એક invoiceમાં જેટલી truck જોઈએ એટલી add કરો':'एक इनवॉइस में जितने ट्रक चाहिए उतने जोड़ें','એક જ entryમાંથી Trip, Invoice, Party અને Supplier બધે લાગુ પડશે':'एक ही एंट्री से ट्रिप, इनवॉइस, पार्टी और सप्लायर सभी जगह लागू होंगे','આ Truck / Trip માટે અલગ supplier payment details':'इस ट्रक / ट्रिप के लिए अलग सप्लायर पेमेंट विवरण','Invoice select karsho to payment exact e invoice sathe link thashe. Blank rakhsho to old pending invoices ma FIFO allocation thashe.':'इनवॉइस चुनने पर पेमेंट उसी इनवॉइस से जुड़ेगा। खाली रखने पर पुराने बाकी इनवॉइस में FIFO आवंटन होगा।','Command Palette:':'कमांड पैलेट:','keyboard par':'कीबोर्ड पर','Loading…':'लोड हो रहा है…','Upload Documents':'दस्तावेज़ अपलोड करें','Smart Operations':'स्मार्ट ऑपरेशन','Alerts':'सूचनाएँ'
  });

  Object.assign(GU,{
    'Days':'દિવસ','Revenue':'આવક','Other Expenses':'અન્ય ખર્ચ','FREIGHT':'ભાડું','PAYMENT':'ચુકવણી','PM BILL':'PM બિલ','CASH':'રોકડ','BANK':'બૅન્ક','UPI':'UPI','NEFT':'NEFT','RTGS':'RTGS','DRAFT':'ડ્રાફ્ટ','DISPATCHED':'ડિસ્પેચ થયેલ','CONVERTED':'ટ્રિપમાં ફેરવેલ','REVIEWED':'તપાસ પૂર્ણ','OK':'બરાબર','INFO':'માહિતી','CRITICAL':'ગંભીર','Sun':'રવિ','Mon':'સોમ','Tue':'મંગળ','Wed':'બુધ','Thu':'ગુરુ','Fri':'શુક્ર','Sat':'શનિ','year':'વર્ષ','month':'મહિનો','Supplier Entries':'સપ્લાયર એન્ટ્રીઓ','Delete this trip?':'આ ટ્રિપ ડિલીટ કરવી છે?','Delete this PM bill?':'આ PM બિલ ડિલીટ કરવું છે?','Delete this invoice?':'આ ઇન્વૉઇસ ડિલીટ કરવું છે?','Delete this party?':'આ પાર્ટી ડિલીટ કરવી છે?','Delete this party payment?':'આ પાર્ટી ચુકવણી ડિલીટ કરવી છે?','Delete this supplier entry?':'આ સપ્લાયર એન્ટ્રી ડિલીટ કરવી છે?','Delete this supplier payment?':'આ સપ્લાયર ચુકવણી ડિલીટ કરવી છે?','Delete this truck?':'આ ટ્રક ડિલીટ કરવો છે?','Delete this document?':'આ દસ્તાવેજ ડિલીટ કરવો છે?','Delete this route?':'આ રૂટ ડિલીટ કરવો છે?','Delete this material?':'આ મટીરિયલ ડિલીટ કરવું છે?','Delete this expense?':'આ ખર્ચ ડિલીટ કરવો છે?','Backup restored successfully.':'બેકઅપ સફળતાપૂર્વક પાછું આવ્યું.','Creating company...':'કંપની બની રહી છે...','Unable to create company':'કંપની બની શકી નહીં','Settings default par reset karva?':'સેટિંગ્સ ડિફૉલ્ટ પર રીસેટ કરવી છે?','Browser notification support available nathi.':'બ્રાઉઝર notification support ઉપલબ્ધ નથી.','Notification permission allow thayu nathi.':'Notification permission મળી નથી.'
  });
  Object.assign(HI,{
    'Days':'दिन','Revenue':'आय','Other Expenses':'अन्य खर्च','FREIGHT':'भाड़ा','PAYMENT':'पेमेंट','PM BILL':'PM बिल','CASH':'नकद','BANK':'बैंक','UPI':'UPI','NEFT':'NEFT','RTGS':'RTGS','DRAFT':'ड्राफ्ट','DISPATCHED':'डिस्पैच','CONVERTED':'ट्रिप में बदला','REVIEWED':'जाँच पूरी','OK':'ठीक','INFO':'जानकारी','CRITICAL':'गंभीर','Sun':'रवि','Mon':'सोम','Tue':'मंगल','Wed':'बुध','Thu':'गुरु','Fri':'शुक्र','Sat':'शनि','year':'वर्ष','month':'महीना','Supplier Entries':'सप्लायर एंट्री','Delete this trip?':'यह ट्रिप डिलीट करें?','Delete this PM bill?':'यह PM बिल डिलीट करें?','Delete this invoice?':'यह इनवॉइस डिलीट करें?','Delete this party?':'यह पार्टी डिलीट करें?','Delete this party payment?':'यह पार्टी पेमेंट डिलीट करें?','Delete this supplier entry?':'यह सप्लायर एंट्री डिलीट करें?','Delete this supplier payment?':'यह सप्लायर पेमेंट डिलीट करें?','Delete this truck?':'यह ट्रक डिलीट करें?','Delete this document?':'यह दस्तावेज़ डिलीट करें?','Delete this route?':'यह रूट डिलीट करें?','Delete this material?':'यह मटेरियल डिलीट करें?','Delete this expense?':'यह खर्च डिलीट करें?','Backup restored successfully.':'बैकअप सफलतापूर्वक वापस आया।','Creating company...':'कंपनी बन रही है...','Unable to create company':'कंपनी नहीं बन सकी','Settings default par reset karva?':'सेटिंग्स डिफ़ॉल्ट पर रीसेट करें?','Browser notification support available nathi.':'ब्राउज़र notification support उपलब्ध नहीं है।','Notification permission allow thayu nathi.':'Notification permission नहीं मिली।'
  });

  Object.assign(GU,{'Approval':'મંજૂરી','Trucks':'ટ્રક','Trip-wise below':'નીચે ટ્રિપ મુજબ','COMMAND':'કમાન્ડ','INVOICE':'ઇન્વૉઇસ','PARTY':'પાર્ટી','TRUCK':'ટ્રક'});
  Object.assign(HI,{'Approval':'मंज़ूरी','Trucks':'ट्रक','Trip-wise below':'नीचे ट्रिप के अनुसार','COMMAND':'कमांड','INVOICE':'इनवॉइस','PARTY':'पार्टी','TRUCK':'ट्रक'});

  Object.assign(GU,{
    'Download complete':'ડાઉનલોડ પૂર્ણ','Tap to open the downloaded file':'ડાઉનલોડ થયેલી ફાઇલ ખોલવા ટૅપ કરો','Fleet & Office':'ફ્લીટ અને ઓફિસ','Driver Khata':'ડ્રાઇવર ખાતું','My Trucks':'મારી ટ્રકો','My Trucks & Expenses':'મારી ટ્રકો અને ખર્ચ','Truck Expenses':'ટ્રક ખર્ચ','Old Excel Invoice Import':'જૂની Excelમાંથી ઇન્વૉઇસ','Excel Invoice Import':'Excel ઇન્વૉઇસ ઇમ્પોર્ટ',
    'Total Driver Balance':'કુલ ડ્રાઇવર બેલેન્સ','Driver Gave / Driver Got balance register':'ડ્રાઇવરને આપેલ / ડ્રાઇવર પાસેથી મળેલ હિસાબ','Add Driver':'ડ્રાઇવર ઉમેરો','Search by Driver Name':'ડ્રાઇવરનું નામ શોધો','Driver Name':'ડ્રાઇવરનું નામ','Licence Number':'લાઇસન્સ નંબર','No licence number':'લાઇસન્સ નંબર નથી','No mobile':'મોબાઇલ નથી','Save Driver':'ડ્રાઇવર સેવ કરો','Update Driver':'ડ્રાઇવર અપડેટ કરો','Driver Gave':'ડ્રાઇવરને આપ્યું','Driver Got':'ડ્રાઇવર પાસેથી મળ્યું','No Driver Khata entry yet.':'હજી ડ્રાઇવર ખાતામાં એન્ટ્રી નથી.','Save Entry':'એન્ટ્રી સેવ કરો','Download Ledger':'ખાતું ડાઉનલોડ કરો',
    'My Truck Expenses':'મારી ટ્રકનો ખર્ચ','Truck details, documents and expense ledger':'ટ્રક વિગત, દસ્તાવેજ અને ખર્ચ ખાતું','Search truck or owner':'ટ્રક અથવા માલિક શોધો','Expense Report':'ખર્ચ રિપોર્ટ','Expenses':'ખર્ચ','Expense':'ખર્ચ','View Ledger':'ખાતું જુઓ','Documents & truck expenses':'દસ્તાવેજ અને ટ્રક ખર્ચ','Own-truck expense register and reports':'પોતાની ટ્રકનો ખર્ચ રજિસ્ટર અને રિપોર્ટ','Truck, trip and office-style expense register':'ટ્રક અને ટ્રિપ મુજબનો ખર્ચ રજિસ્ટર','Add Truck Expense':'ટ્રક ખર્ચ ઉમેરો','Selected Month Total':'પસંદ કરેલા મહિનાનો કુલ ખર્ચ','Expense Type':'ખર્ચનો પ્રકાર','Choose Expense Type':'ખર્ચનો પ્રકાર પસંદ કરો','Expense Amount':'ખર્ચની રકમ','Expense Date':'ખર્ચની તારીખ','Payment Mode':'ચુકવણી રીત','Trip ID (optional)':'ટ્રિપ ID (વૈકલ્પિક)','Note':'નોંધ','Confirm':'ખાતરી કરો','Total Truck Expense':'કુલ ટ્રક ખર્ચ','Delete this Truck Expense?':'આ ટ્રક ખર્ચ ડિલીટ કરવો છે?','Add Custom Expense Type':'નવો ખર્ચ પ્રકાર ઉમેરો','Enter custom Expense Type':'નવા ખર્ચ પ્રકારનું નામ લખો',
    'Old Excel → Invoice Import':'જૂની Excel → ઇન્વૉઇસ ઇમ્પોર્ટ','Upload old Bill Excel, map columns, preview and create invoices':'જૂની Bill Excel upload કરીને column ગોઠવો, preview જુઓ અને invoices બનાવો','Select Excel':'Excel પસંદ કરો','Map Columns':'Column ગોઠવો','Create Invoices':'ઇન્વૉઇસ બનાવો','Choose old Excel file':'જૂની Excel file પસંદ કરો','Your file is previewed before saving':'સેવ કરતાં પહેલાં fileનું preview બતાવશે','Select your old Excel file to begin. Existing invoices are not changed automatically.':'શરૂ કરવા જૂની Excel file પસંદ કરો. હાલના invoices આપમેળે બદલાશે નહીં.','Column Mapping':'Column ગોઠવણી','Not available':'ઉપલબ્ધ નથી','detected':'મળ્યા','ready':'તૈયાર','duplicates skipped':'ડુપ્લિકેટ છોડ્યા','need mapping':'ગોઠવણી બાકી','Bill / Invoice No.':'Bill / ઇન્વૉઇસ નં.','Party / Ledger Number':'પાર્ટી / ખાતા નંબર','Truck / Gadi Number':'ટ્રક / ગાડી નંબર','Route / Description':'રૂટ / વિગત','Line / Bill Amount':'લાઇન / Bill રકમ','Create':'બનાવો','Importing...':'ઇમ્પોર્ટ થઈ રહ્યું છે...','Excel invoice import complete.':'Excel ઇન્વૉઇસ ઇમ્પોર્ટ પૂર્ણ થયો.','Downloaded successfully':'સફળતાપૂર્વક ડાઉનલોડ થયું',
    'DRIVER BHATTA':'ડ્રાઇવર ભથ્થું','DRIVER PAYMENT':'ડ્રાઇવર ચુકવણી','LOADING CHARGES':'લોડિંગ ચાર્જ','UNLOADING CHARGES':'અનલોડિંગ ચાર્જ','DETENTION CHARGES':'ડિટેન્શન ચાર્જ','UNION CHARGES':'યુનિયન ચાર્જ','TOLL EXPENSE':'ટોલ ખર્ચ','POLICE EXPENSE':'પોલીસ ખર્ચ','RTO EXPENSE':'RTO ખર્ચ','BROKERAGE EXPENSE':'બ્રોકરેજ ખર્ચ','FUEL EXPENSE':'ઇંધણ ખર્ચ','SHOWROOM SERVICE':'શોરૂમ સર્વિસ','REGULAR SERVICE':'નિયમિત સર્વિસ','MINOR REPAIR':'નાનું રિપેરિંગ','GEAR MAINTENANCE':'ગિયર મેન્ટેનન્સ','BRAKE OIL CHANGE':'બ્રેક ઓઇલ બદલવું','GREASE OIL CHANGE':'ગ્રીસ ઓઇલ બદલવું','ENGINE OIL CHANGE':'એન્જિન ઓઇલ બદલવું','SPARE PARTS PURCHASE':'સ્પેર પાર્ટ્સ ખરીદી','AIR FILTER CHANGE':'એર ફિલ્ટર બદલવું','OTHER EXPENSE':'અન્ય ખર્ચ'
  });
  Object.assign(HI,{
    'Download complete':'डाउनलोड पूरा हुआ','Tap to open the downloaded file':'डाउनलोड की गई फाइल खोलने के लिए टैप करें','Fleet & Office':'फ्लीट और ऑफिस','Driver Khata':'ड्राइवर खाता','My Trucks':'मेरे ट्रक','My Trucks & Expenses':'मेरे ट्रक और खर्च','Truck Expenses':'ट्रक खर्च','Old Excel Invoice Import':'पुरानी Excel से इनवॉइस','Excel Invoice Import':'Excel इनवॉइस इम्पोर्ट',
    'Total Driver Balance':'कुल ड्राइवर बैलेंस','Driver Gave / Driver Got balance register':'ड्राइवर को दिया / ड्राइवर से मिला खाता','Add Driver':'ड्राइवर जोड़ें','Search by Driver Name':'ड्राइवर नाम खोजें','Driver Name':'ड्राइवर नाम','Licence Number':'लाइसेंस नंबर','No licence number':'लाइसेंस नंबर नहीं','No mobile':'मोबाइल नहीं','Save Driver':'ड्राइवर सेव करें','Update Driver':'ड्राइवर अपडेट करें','Driver Gave':'ड्राइवर को दिया','Driver Got':'ड्राइवर से मिला','No Driver Khata entry yet.':'अभी ड्राइवर खाते में कोई एंट्री नहीं है।','Save Entry':'एंट्री सेव करें','Download Ledger':'खाता डाउनलोड करें',
    'My Truck Expenses':'मेरे ट्रक का खर्च','Truck details, documents and expense ledger':'ट्रक विवरण, दस्तावेज़ और खर्च खाता','Search truck or owner':'ट्रक या मालिक खोजें','Expense Report':'खर्च रिपोर्ट','Expenses':'खर्च','Expense':'खर्च','View Ledger':'खाता देखें','Documents & truck expenses':'दस्तावेज़ और ट्रक खर्च','Own-truck expense register and reports':'अपने ट्रक का खर्च रजिस्टर और रिपोर्ट','Truck, trip and office-style expense register':'ट्रक और ट्रिप के अनुसार खर्च रजिस्टर','Add Truck Expense':'ट्रक खर्च जोड़ें','Selected Month Total':'चुने महीने का कुल खर्च','Expense Type':'खर्च का प्रकार','Choose Expense Type':'खर्च का प्रकार चुनें','Expense Amount':'खर्च राशि','Expense Date':'खर्च तारीख','Payment Mode':'भुगतान तरीका','Trip ID (optional)':'ट्रिप ID (वैकल्पिक)','Note':'नोट','Confirm':'पुष्टि करें','Total Truck Expense':'कुल ट्रक खर्च','Delete this Truck Expense?':'यह ट्रक खर्च डिलीट करें?','Add Custom Expense Type':'नया खर्च प्रकार जोड़ें','Enter custom Expense Type':'नए खर्च प्रकार का नाम लिखें',
    'Old Excel → Invoice Import':'पुरानी Excel → इनवॉइस इम्पोर्ट','Upload old Bill Excel, map columns, preview and create invoices':'पुरानी Bill Excel अपलोड करके कॉलम मिलाएँ, प्रीव्यू देखें और इनवॉइस बनाएँ','Select Excel':'Excel चुनें','Map Columns':'कॉलम मिलाएँ','Create Invoices':'इनवॉइस बनाएँ','Choose old Excel file':'पुरानी Excel फाइल चुनें','Your file is previewed before saving':'सेव करने से पहले फाइल का प्रीव्यू दिखेगा','Select your old Excel file to begin. Existing invoices are not changed automatically.':'शुरू करने के लिए पुरानी Excel फाइल चुनें। मौजूदा इनवॉइस अपने-आप नहीं बदलेंगे।','Column Mapping':'कॉलम मैपिंग','Not available':'उपलब्ध नहीं','detected':'मिले','ready':'तैयार','duplicates skipped':'डुप्लिकेट छोड़े','need mapping':'मैपिंग बाकी','Bill / Invoice No.':'Bill / इनवॉइस नं.','Party / Ledger Number':'पार्टी / खाता नंबर','Truck / Gadi Number':'ट्रक / गाड़ी नंबर','Route / Description':'रूट / विवरण','Line / Bill Amount':'लाइन / Bill राशि','Create':'बनाएँ','Importing...':'इम्पोर्ट हो रहा है...','Excel invoice import complete.':'Excel इनवॉइस इम्पोर्ट पूरा हुआ।','Downloaded successfully':'सफलतापूर्वक डाउनलोड हुआ',
    'DRIVER BHATTA':'ड्राइवर भत्ता','DRIVER PAYMENT':'ड्राइवर भुगतान','LOADING CHARGES':'लोडिंग चार्ज','UNLOADING CHARGES':'अनलोडिंग चार्ज','DETENTION CHARGES':'डिटेंशन चार्ज','UNION CHARGES':'यूनियन चार्ज','TOLL EXPENSE':'टोल खर्च','POLICE EXPENSE':'पुलिस खर्च','RTO EXPENSE':'RTO खर्च','BROKERAGE EXPENSE':'ब्रोकरेज खर्च','FUEL EXPENSE':'ईंधन खर्च','SHOWROOM SERVICE':'शोरूम सर्विस','REGULAR SERVICE':'नियमित सर्विस','MINOR REPAIR':'छोटी मरम्मत','GEAR MAINTENANCE':'गियर मेंटेनेंस','BRAKE OIL CHANGE':'ब्रेक ऑयल बदलना','GREASE OIL CHANGE':'ग्रीस ऑयल बदलना','ENGINE OIL CHANGE':'इंजन ऑयल बदलना','SPARE PARTS PURCHASE':'स्पेयर पार्ट्स खरीद','AIR FILTER CHANGE':'एयर फिल्टर बदलना','OTHER EXPENSE':'अन्य खर्च'
  });
  Object.assign(GU,{
    'Upload old Bill Excel, automatically detect every sheet, preview and create invoices':'જૂની Bill Excel upload કરો; દરેક sheet આપમેળે ઓળખીને preview બાદ invoices બનાવો','Detect Format':'ફોર્મેટ ઓળખો','Automatic Excel Detection':'Excel ફોર્મેટ આપમેળે ઓળખાણ','Formatted Invoice':'તૈયાર ઇન્વૉઇસ','Invoice List':'ઇન્વૉઇસ લિસ્ટ','Bill / Loading Date':'Bill / લોડિંગ તારીખ','Tax':'ટેક્સ','need correction':'સુધારો જરૂરી','rows':'રો','invoices':'ઇન્વૉઇસ','sheet/table(s)':'sheet/table','IGST Invoice':'IGST ઇન્વૉઇસ','IGST Transport Invoice':'IGST ટ્રાન્સપોર્ટ ઇન્વૉઇસ','Original tax':'મૂળ ટેક્સ','No supported table found.':'ઓળખી શકાય એવું invoice table મળ્યું નથી.','No supported invoice rows found. Keep Bill No., Date, Truck No. and Amount/Total headings in the Excel.':'Invoice row મળ્યાં નથી. Excelમાં Bill No., Date, Truck No. અને Amount/Total heading રાખો.'
  });
  Object.assign(HI,{
    'Upload old Bill Excel, automatically detect every sheet, preview and create invoices':'पुरानी Bill Excel अपलोड करें; हर sheet अपने-आप पहचानकर प्रीव्यू के बाद इनवॉइस बनाएँ','Detect Format':'फॉर्मेट पहचानें','Automatic Excel Detection':'Excel फॉर्मेट की अपने-आप पहचान','Formatted Invoice':'तैयार इनवॉइस','Invoice List':'इनवॉइस सूची','Bill / Loading Date':'Bill / लोडिंग तारीख','Tax':'टैक्स','need correction':'सुधार जरूरी','rows':'पंक्तियाँ','invoices':'इनवॉइस','sheet/table(s)':'sheet/table','IGST Invoice':'IGST इनवॉइस','IGST Transport Invoice':'IGST ट्रांसपोर्ट इनवॉइस','Original tax':'मूल टैक्स','No supported table found.':'पहचानने योग्य invoice table नहीं मिला।','No supported invoice rows found. Keep Bill No., Date, Truck No. and Amount/Total headings in the Excel.':'Invoice पंक्तियाँ नहीं मिलीं। Excel में Bill No., Date, Truck No. और Amount/Total heading रखें।'
  });

  const DICTIONARIES={gu:GU,hi:HI};
  // Route names are localized only while they are displayed. The option value
  // and the data stored in D1/local backups remain exactly as entered.
  const ROUTE_NAMES={
    gu:{
      ANJAR:'અંજાર',ANKLESHWAR:'અંકલેશ્વર',BHUJ:'ભુજ',DAHEJ:'દહેજ',DHANETI:'ધાણેટી',
      ESAAR:'એસ્સાર',ESSAR:'એસ્સાર',RELINCE:'રિલાયન્સ',RELIANCE:'રિલાયન્સ',
      WELPSUN:'વેલસ્પન',WELSPUN:'વેલસ્પન',SIKKA:'સિક્કા',PIPAVAV:'પીપાવાવ',
      WANKANER:'વાંકાનેર',KANDLA:'કંડલા',SANAND:'સાણંદ',SANTEJ:'સાંટેજ',
      JAMNAGAR:'જામનગર',LALPAR:'લાલપર',HALOL:'હાલોલ',JAGHADIA:'ઝઘડિયા',
      JHAGADIA:'ઝઘડિયા',DCC:'ડી.સી.સી.',BHOJABEDI:'ભોજાબેડી','BHOJA BEDI':'ભોજાબેડી',BEDI:'બેડી',
      MUNDRA:'મુંદ્રા',HAJIRA:'હજીરા',MORBI:'મોરબી',RAJKOT:'રાજકોટ',DWARKA:'દ્વારકા',KHAMBHALIA:'ખંભાળિયા',
      OKHA:'ઓખા',PORBANDAR:'પોરબંદર',AHMEDABAD:'અમદાવાદ',SURAT:'સુરત',VADODARA:'વડોદરા',GANDHIDHAM:'ગાંધીધામ'
    },
    hi:{
      ANJAR:'अंजार',ANKLESHWAR:'अंकलेश्वर',BHUJ:'भुज',DAHEJ:'दहेज',DHANETI:'धानेटी',
      ESAAR:'एस्सार',ESSAR:'एस्सार',RELINCE:'रिलायंस',RELIANCE:'रिलायंस',
      WELPSUN:'वेलस्पन',WELSPUN:'वेलस्पन',SIKKA:'सिक्का',PIPAVAV:'पीपावाव',
      WANKANER:'वांकानेर',KANDLA:'कांडला',SANAND:'साणंद',SANTEJ:'सांतेज',
      JAMNAGAR:'जामनगर',LALPAR:'लालपर',HALOL:'हालोल',JAGHADIA:'झगड़िया',
      JHAGADIA:'झगड़िया',DCC:'डी.सी.सी.',BHOJABEDI:'भोजाबेड़ी','BHOJA BEDI':'भोजाबेड़ी',BEDI:'बेड़ी',
      MUNDRA:'मुंद्रा',HAJIRA:'हजीरा',MORBI:'मोरबी',RAJKOT:'राजकोट',DWARKA:'द्वारका',KHAMBHALIA:'खंभालिया',
      OKHA:'ओखा',PORBANDAR:'पोरबंदर',AHMEDABAD:'अहमदाबाद',SURAT:'सूरत',VADODARA:'वडोदरा',GANDHIDHAM:'गांधीधाम'
    }
  };
  const originalText=new WeakMap();
  const originalAttrs=new WeakMap();
  const boundLanguageButtons=new WeakSet();
  let activeLanguage=readLanguage();
  let scheduled=false;

  function readLanguage(){
    try{
      const value=localStorage.getItem(STORAGE_KEY)||'en';
      return SUPPORTED.has(value)?value:'en';
    }catch{return 'en'}
  }

  function dictionary(){return DICTIONARIES[activeLanguage]||null}
  function translateExact(value){return dictionary()?.[value]||value}
  function countWord(word){
    return translateExact(word);
  }
  const DYNAMIC_PREFIXES=[
    'Supplier','Driver','Billed','Received','Payable','Paid','Outstanding','Expiry','Expired','Exp',
    'Trial end','Period end','Active users','Party outstanding','Supplier payment pending','Uploading',
    'Uploaded','Checked','Company','Unallocated Party Credit','Cross-company links'
  ];
  function translateUnit(value){
    const exact=translateExact(value);
    if(exact!==value)return exact;

    // Currency, emoji and + / (-) decorations are visual UI, not part of the
    // dictionary key. This fixes labels such as "₹ Pay Supplier" and
    // "+ New Trip" without touching the action or stored value.
    const decorated=String(value).match(/^([^\p{L}\p{N}]+)\s*(.+)$/u);
    if(decorated){
      const translated=translateUnit(decorated[2]);
      if(translated!==decorated[2])return `${decorated[1].trimEnd()} ${translated}`;
    }

    // Counts occur throughout cards and summaries (for example "24 trips",
    // "2 freight entries" and "3/50 Invoices"). Translate the known unit
    // while preserving the exact numeric value.
    const count=String(value).match(/^([0-9][0-9,./-]*)\s+(.+)$/);
    if(count){
      const unit=countWord(count[2]);
      if(unit!==count[2])return `${count[1]} ${unit}`;
    }

    const instruction=String(value).match(/^(Search|Select|Add New)\s+(.+?)(…|\.\.\.)?$/);
    if(instruction){
      const verb=translateExact(instruction[1]);
      let subject=translateExact(instruction[2]);
      if(subject===instruction[2]&&instruction[2].endsWith(' Truck')){
        subject=instruction[2].slice(0,-6)+' '+translateExact('Truck');
      }
      if(verb!==instruction[1]||subject!==instruction[2])return `${verb} ${subject}${instruction[3]||''}`;
    }

    // Keep business data after a UI label unchanged: "Supplier: JASUBHAI"
    // becomes a localized label followed by the original supplier name.
    const colon=String(value).match(/^([^:]{1,60}):(\s*)(.*)$/);
    if(colon){
      const label=translateExact(colon[1]);
      if(label!==colon[1])return `${label}:${colon[2]}${colon[3]}`;
    }
    for(const prefix of DYNAMIC_PREFIXES){
      if(!String(value).startsWith(prefix+' '))continue;
      const label=translateExact(prefix);
      if(label!==prefix)return label+String(value).slice(prefix.length);
    }
    return value;
  }
  function translateValue(value){
    if(activeLanguage==='en'||!value)return value;
    const exact=translateExact(value);
    if(exact!==value)return exact;
    const parts=value.split(/(\s+·\s+)/);
    if(parts.length>1)return parts.map(part=>/^\s+·\s+$/.test(part)?part:translateUnit(part)).join('');
    return translateUnit(value);
  }
  const ROMAN_SCRIPTS={
    gu:{virama:'્',consonants:{k:'ક',kh:'ખ',g:'ગ',gh:'ઘ',ch:'ચ',chh:'છ',j:'જ',jh:'ઝ',t:'ત',th:'થ',d:'દ',dh:'ધ',n:'ન',p:'પ',ph:'ફ',f:'ફ',b:'બ',bh:'ભ',m:'મ',y:'ય',r:'ર',l:'લ',v:'વ',w:'વ',s:'સ',sh:'શ',h:'હ',z:'ઝ',q:'ક',x:'ક્ષ'},vowels:{a:['','અ'],aa:['ા','આ'],i:['િ','ઇ'],ii:['ી','ઈ'],ee:['ી','ઈ'],u:['ુ','ઉ'],uu:['ૂ','ઊ'],oo:['ૂ','ઊ'],e:['ે','એ'],ai:['ૈ','ઐ'],o:['ો','ઓ'],au:['ૌ','ઔ'],ou:['ૌ','ઔ']}},
    hi:{virama:'्',consonants:{k:'क',kh:'ख',g:'ग',gh:'घ',ch:'च',chh:'छ',j:'ज',jh:'झ',t:'त',th:'थ',d:'द',dh:'ध',n:'न',p:'प',ph:'फ',f:'फ',b:'ब',bh:'भ',m:'म',y:'य',r:'र',l:'ल',v:'व',w:'व',s:'स',sh:'श',h:'ह',z:'ज़',q:'क',x:'क्ष'},vowels:{a:['','अ'],aa:['ा','आ'],i:['ि','इ'],ii:['ी','ई'],ee:['ी','ई'],u:['ु','उ'],uu:['ू','ऊ'],oo:['ू','ऊ'],e:['े','ए'],ai:['ै','ऐ'],o:['ो','ओ'],au:['ौ','औ'],ou:['ौ','औ']}}
  };
  const ROMAN_UNITS=['chh','kh','gh','jh','th','dh','ph','bh','sh','aa','ai','au','ee','ii','oo','ou','uu'];
  function transliterateRomanWord(word,language){
    const script=ROMAN_SCRIPTS[language];
    if(!script||!/^[A-Za-z]+$/.test(word))return word;
    const source=word.toLowerCase();let out='',index=0,pendingConsonant=false;
    while(index<source.length){
      const unit=ROMAN_UNITS.find(x=>source.startsWith(x,index))||source[index];
      index+=unit.length;
      if(script.vowels[unit]){
        out+=pendingConsonant?script.vowels[unit][0]:script.vowels[unit][1];
        pendingConsonant=false;
        continue;
      }
      const consonant=script.consonants[unit];
      if(consonant){
        if(pendingConsonant)out+=script.virama;
        out+=consonant;pendingConsonant=true;continue;
      }
      out+=unit;pendingConsonant=false;
    }
    return out||word;
  }
  function transliterateRomanRoute(value,language){
    return String(value).split(/([\s/,.()_-]+)/).map(part=>/^[A-Za-z]+$/.test(part)?transliterateRomanWord(part,language):part).join('');
  }
  function translateRoutePart(value){
    if(activeLanguage==='en'||!value)return value;
    const raw=String(value),trimmed=raw.trim();
    const translated=ROUTE_NAMES[activeLanguage]?.[trimmed.toUpperCase()]||transliterateRomanRoute(trimmed,activeLanguage)||trimmed;
    return preserveSpacing(raw,translated);
  }
  function translateRouteValue(value){
    if(activeLanguage==='en'||!value)return value;
    return String(value).split(/(\s*(?:→|↔|–|—)\s*)/).map(part=>
      /(?:→|↔|–|—)/.test(part)?part:translateRoutePart(part)
    ).join('');
  }
  function preserveSpacing(raw,translated){
    if(raw===translated)return raw;
    const lead=raw.match(/^\s*/)?.[0]||'';
    const trail=raw.match(/\s*$/)?.[0]||'';
    return lead+translated+trail;
  }
  function excluded(node){
    return !!node.parentElement?.closest('script,style,textarea,[contenteditable="true"],[data-no-translate],.transport-invoice,.v36-invoice,.v65-lr-sheet,.tds-sheet,.pl40-sheet,.sl41-sheet');
  }
  function translateTextNode(node){
    if(!node?.nodeValue||excluded(node))return;
    // An option without an explicit value uses its visible text as the form
    // value. Leave those data-bound options untouched so Excel sheet names,
    // roles, document kinds and other business enums cannot be localized into
    // a different value on submit. Options with value="..." remain safe to
    // localize because only their display label changes.
    const option=node.parentElement?.closest('option');
    if(option&&!option.hasAttribute('value'))return;
    if(!originalText.has(node))originalText.set(node,node.nodeValue);
    const original=originalText.get(node);
    const trimmed=original.trim();
    if(!trimmed)return;
    const explicitRoute=!!node.parentElement?.closest('[data-route-text],select[name="loadingPoint"],select[name="unloadingPoint"]');
    const routeText=explicitRoute||(/(?:→|↔)/.test(trimmed)&&translateExact(trimmed)===trimmed);
    const translated=routeText?translateRouteValue(trimmed):translateValue(trimmed);
    const next=activeLanguage==='en'?original:preserveSpacing(original,translated);
    if(node.nodeValue!==next)node.nodeValue=next;
  }
  function translateAttributes(element){
    if(!(element instanceof Element)||element.closest('[data-no-translate],.transport-invoice,.v36-invoice,.v65-lr-sheet,.tds-sheet,.pl40-sheet,.sl41-sheet'))return;
    if(element.matches('[data-language-label]'))return;
    const names=['placeholder','aria-label','title','data-label'];
    let originals=originalAttrs.get(element);
    if(!originals){originals={};originalAttrs.set(element,originals)}
    for(const name of names){
      if(!element.hasAttribute(name))continue;
      if(!(name in originals))originals[name]=element.getAttribute(name)||'';
      const original=originals[name];
      const next=activeLanguage==='en'?original:translateValue(original);
      if(element.getAttribute(name)!==next)element.setAttribute(name,next);
    }
  }
  function walk(root){
    if(!root)return;
    if(root.nodeType===Node.TEXT_NODE){translateTextNode(root);return}
    if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
    if(root.nodeType===Node.ELEMENT_NODE)translateAttributes(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())translateTextNode(walker.currentNode);
    const elements=root.querySelectorAll?.('[placeholder],[aria-label],[title],[data-label]')||[];
    elements.forEach(translateAttributes);
  }
  function setDocumentLanguage(){
    const meta=LANGUAGE_META[activeLanguage];
    document.documentElement.lang=activeLanguage;
    document.documentElement.dataset.appLanguage=activeLanguage;
    document.documentElement.style.setProperty('--v683-language-font',activeLanguage==='gu'?"'Noto Sans Gujarati','Nirmala UI',sans-serif":activeLanguage==='hi'?"'Noto Sans Devanagari','Nirmala UI',sans-serif":'inherit');
    document.querySelectorAll('[data-language-label]').forEach(button=>{
      const mobile=button.classList.contains('v683-mobile-language');
      const label=mobile?`🌐 ${meta.short}`:`🌐 ${translateExact('Language')}`;
      const accessible=translateExact('Choose App Language');
      if(button.textContent!==label)button.textContent=label;
      if(button.getAttribute('aria-label')!==accessible)button.setAttribute('aria-label',accessible);
      if(button.title!==accessible)button.title=accessible;
    });
    bindLanguageButtons(document);
  }
  function apply(root=document.body){
    setDocumentLanguage();
    walk(root);
  }
  function schedule(root=document.body){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;apply(root||document.body)});
  }
  function setLanguage(language){
    if(!SUPPORTED.has(language))return false;
    activeLanguage=language;
    try{localStorage.setItem(STORAGE_KEY,language)}catch{}
    apply(document.body);
    document.dispatchEvent(new CustomEvent('ml-language-changed',{detail:{language}}));
    requestAnimationFrame(()=>apply(document.body));
    return true;
  }
  function closePicker(){document.querySelector('.v683-language-overlay')?.remove()}

  function translateDialogMessage(value){
    if(activeLanguage==='en'||value===undefined||value===null)return value;
    return String(value).split('\n').map(translateValue).join('\n');
  }
  function installDialogTranslation(){
    if(window.__mlLanguageDialogsInstalled)return;
    window.__mlLanguageDialogsInstalled=true;
    const nativeAlert=typeof window.alert==='function'?window.alert.bind(window):null;
    const nativeConfirm=typeof window.confirm==='function'?window.confirm.bind(window):null;
    const nativePrompt=typeof window.prompt==='function'?window.prompt.bind(window):null;
    if(nativeAlert)window.alert=message=>nativeAlert(translateDialogMessage(message));
    if(nativeConfirm)window.confirm=message=>nativeConfirm(translateDialogMessage(message));
    if(nativePrompt)window.prompt=(message,defaultValue)=>nativePrompt(translateDialogMessage(message),defaultValue);
  }
  function openPicker(){
    closePicker();
    if(!document.body)return false;
    const host=document.createElement('div');
    host.className='v683-language-overlay';
    host.innerHTML=`<section class="v683-language-modal" role="dialog" aria-modal="true" aria-labelledby="v683-language-title">
      <header><div><b id="v683-language-title">${translateExact('Choose App Language')}</b><small>${translateExact('Select the language used for menus, buttons and messages.')}</small></div><button type="button" data-language-close aria-label="${translateExact('Close')}">✕</button></header>
      <main>
        <p>${translateExact('Your saved business data will not be changed.')}</p>
        <div class="v683-language-grid">
          ${Object.entries(LANGUAGE_META).map(([code,meta])=>`<button type="button" class="${code===activeLanguage?'active':''}" data-language-choice="${code}"><span>${code==='gu'?'અ':code==='hi'?'अ':'A'}</span><b>${meta.nativeName}</b><small>${code===activeLanguage?translateExact('Selected'):meta.name}</small><i>${code===activeLanguage?'✓':'›'}</i></button>`).join('')}
        </div>
      </main>
    </section>`;
    document.body.appendChild(host);
    host.querySelector('[data-language-close]').onclick=closePicker;
    host.addEventListener('click',event=>{if(event.target===host)closePicker()});
    host.querySelectorAll('[data-language-choice]').forEach(button=>button.onclick=()=>{const code=button.dataset.languageChoice;closePicker();setLanguage(code)});
    return true;
  }

  function languageButtonFromEvent(event){
    const target=event?.target;
    const element=target instanceof Element?target:target?.parentElement;
    return element?.closest?.('[data-language-open]')||null;
  }
  function handleLanguageOpen(event){
    const button=languageButtonFromEvent(event);
    if(!button)return;
    if(event.__mlLanguageHandled)return;
    event.__mlLanguageHandled=true;
    event.preventDefault();event.stopPropagation();openPicker();
  }
  function bindLanguageButtons(root=document){
    const buttons=root?.querySelectorAll?.('[data-language-open]')||[];
    buttons.forEach(button=>{
      if(boundLanguageButtons.has(button))return;
      boundLanguageButtons.add(button);
      button.addEventListener('click',handleLanguageOpen);
    });
  }

  // Direct binding is the primary path. Delegation is a fallback for a new
  // button clicked before the next mutation-observer frame.
  document.addEventListener('click',handleLanguageOpen);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closePicker()});
  new MutationObserver(()=>{
    // A single render may update the header, panel and advanced overlay in one
    // mutation batch. Audit the shared UI root so no later-added menu or modal
    // is skipped merely because it was not the first mutation target.
    schedule(document.body);
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});

  window.TransportLanguage={
    get:()=>activeLanguage,
    set:setLanguage,
    t:translateExact,
    dateLocale:()=>LANGUAGE_META[activeLanguage].locale,
    open:openPicker,
    apply:()=>apply(document.body),
    buttonLabel:()=>`🌐 ${LANGUAGE_META[activeLanguage].short}`,
    text:value=>translateValue(String(value??'')),
    place:value=>translateRoutePart(String(value??'')),
    route:value=>translateRouteValue(String(value??''))
  };
  installDialogTranslation();
  setDocumentLanguage();
  if(document.body)apply(document.body);
})();
