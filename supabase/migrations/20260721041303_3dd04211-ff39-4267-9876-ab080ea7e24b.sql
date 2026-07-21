DELETE FROM public.community_symptoms
WHERE
  name ~ '[?,.;:!]'
  OR name ~* '^(re|s|t|ll|ve|d|m|and|or|but|the|a|an|is|it|that|this|you|your|we|they|if|when|so|because|as|to|for|not|no|yes|up|also|just)\s'
  OR name ~ '\s\S+\s\S+\s\S+\s'  -- more than 3 words
  OR char_length(name) < 3
  OR char_length(name) > 30
  OR name !~ '^[a-zA-Z][a-zA-Z\s-]*[a-zA-Z]$';