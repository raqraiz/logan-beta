
UPDATE public.community_symptoms SET category = 'Skin & Body' WHERE lower(name) IN ('back itchiness','body odor changes','breakouts','cystic acne','dehydrated skin','hair shedding','itchy scalp','itchy skin','reaction to mosquito bites','redness','vulvular itchiness');

UPDATE public.community_symptoms SET category = 'Digestive' WHERE lower(name) IN ('constipation','diarrhea','gas','heartburn','eating habits');

UPDATE public.community_symptoms SET category = 'Ear/Nose/Throat' WHERE lower(name) IN ('ear fullness','ear itchiness','hearing loss','sore throat','swollen glands','highly sensitive smell','sensitive to smells','vertigo');

UPDATE public.community_symptoms SET category = 'Sleep & Energy' WHERE lower(name) IN ('dreams and nightmares','exhausted','sleepy');

UPDATE public.community_symptoms SET category = 'Mood & Cognitive' WHERE lower(name) IN ('memory loss','stress','sudden rage');

UPDATE public.community_symptoms SET category = 'Reproductive & Discharge' WHERE lower(name) IN ('cervical position','egg white','libido','mittelschmerz','musky','ovulation','ovulation discharge','swollen breasts');

UPDATE public.community_symptoms SET category = 'Pain' WHERE lower(name) IN ('achey','body aches','crampy');

UPDATE public.community_symptoms SET category = 'Other' WHERE lower(name) IN ('dizzy','frequent urination','louder','storm','stronger','thirst','tingly hands');
