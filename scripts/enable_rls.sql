ALTER TABLE petpro_barrios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON petpro_barrios FOR SELECT USING (true);
