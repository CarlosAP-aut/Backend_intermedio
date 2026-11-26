-- =========================================================
-- TIENDA DE BELLEZA "ROSA LUMINA" - BASE DE DATOS (MySQL 8)
-- Ejecutar completo para crear (o reiniciar) la base de datos.
-- =========================================================

DROP DATABASE IF EXISTS tienda_belleza;
CREATE DATABASE tienda_belleza
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tienda_belleza;

-- ---------------------------------------------------------
-- 1. CATEGORIAS
-- ---------------------------------------------------------
CREATE TABLE categorias (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(60)  NOT NULL UNIQUE,
  descripcion VARCHAR(200) NULL
);

-- ---------------------------------------------------------
-- 2. PRODUCTOS (inventario)
-- ---------------------------------------------------------
CREATE TABLE productos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  sku           VARCHAR(20)   NOT NULL UNIQUE,
  nombre        VARCHAR(120)  NOT NULL,
  marca         VARCHAR(80)   NOT NULL,
  categoria_id  INT           NOT NULL,
  descripcion   VARCHAR(300)  NULL,
  precio        DECIMAL(10,2) NOT NULL,
  stock         INT           NOT NULL DEFAULT 0,
  stock_minimo  INT           NOT NULL DEFAULT 5,
  imagen_url    VARCHAR(300)  NULL,
  creado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_producto_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  CONSTRAINT chk_precio CHECK (precio > 0),
  CONSTRAINT chk_stock  CHECK (stock >= 0)
);

-- ---------------------------------------------------------
-- 3. PEDIDOS (ventas realizadas desde la tienda)
-- ---------------------------------------------------------
CREATE TABLE pedidos (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  fecha  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total  DECIMAL(10,2) NOT NULL
);

CREATE TABLE pedido_detalle (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id        INT           NOT NULL,
  producto_id      INT           NOT NULL,
  cantidad         INT           NOT NULL,
  precio_unitario  DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_detalle_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_producto
    FOREIGN KEY (producto_id) REFERENCES productos(id),
  CONSTRAINT chk_cantidad CHECK (cantidad > 0)
);

-- ---------------------------------------------------------
-- 4. DATOS DE EJEMPLO (marcas y productos inventados)
-- ---------------------------------------------------------
INSERT INTO categorias (nombre, descripcion) VALUES
('Maquillaje',        'Bases, labiales, sombras y máscaras'),
('Cuidado de la piel','Limpiadores, sueros e hidratantes'),
('Protección solar',  'Bloqueadores y productos post-sol'),
('Cabello',           'Shampoo, acondicionador y tratamientos'),
('Fragancias',        'Perfumes, colonias y brumas corporales'),
('Uñas',              'Esmaltes y cuidado de uñas');

INSERT INTO productos
(sku, nombre, marca, categoria_id, descripcion, precio, stock, stock_minimo)
VALUES
-- Maquillaje (1)
('MAQ-001', 'Base Velo de Seda FPS 15',      'Velvet Studio',     1, 'Base liquida de cobertura media y acabado satinado.',        389.00, 24, 6),
('MAQ-002', 'Labial Mate Rosa Antigua',      'Velvet Studio',     1, 'Labial de larga duración con vitamina E.',                   219.00, 40, 8),
('MAQ-003', 'Máscara Volumen Nube',          'Aurora Skin',       1, 'Máscara de pestañas resistente al agua.',                    249.00,  4, 6),
('MAQ-004', 'Paleta de Sombras Atardecer',   'Rosa Mística',      1, '12 tonos calidos mate y metálicos.',                         459.00, 15, 5),
('MAQ-005', 'Rubor en Crema Durazno',        'Rosa Mística',      1, 'Rubor cremoso de fácil difuminado.',                         199.00, 32, 6),
('MAQ-006', 'Corrector Iluminador',          'Velvet Studio',     1, 'Cubre ojeras con efecto luminoso.',                          229.00,  0, 5),
-- Cuidado de la piel (2)
('PIE-001', 'Gel Limpiador Pepino y Té Verde','Herbal Nube',      2, 'Limpieza suave para piel mixta a grasa.',                    179.00, 50, 10),
('PIE-002', 'Suero Vitamina C 15%',           'Lumière Botánica', 2, 'Antioxidante e iluminador para uso diario.',                 549.00, 18, 5),
('PIE-003', 'Crema Hidratante Ácido Hialurónico','Aurora Skin',   2, 'Hidratación de 48 horas, textura ligera.',                   429.00, 27, 6),
('PIE-004', 'Mascarilla de Arcilla Rosa',     'Herbal Nube',      2, 'Purifica poros y suaviza la piel.',                          259.00,  3, 5),
('PIE-005', 'Contorno de Ojos Cafeína',       'Lumière Botánica', 2, 'Reduce bolsas y ojeras.',                                    379.00, 12, 4),
('PIE-006', 'Tónico de Agua de Rosas',        'Rosa Mística',     2, 'Equilibra el pH y refresca.',                                159.00, 45, 8),
-- Proteccion solar (3)
('SOL-001', 'Bloqueador Facial FPS 50 Toque Seco','Aurora Skin',  3, 'Protección amplia UVA/UVB, sin brillo.',                     349.00, 30, 10),
('SOL-002', 'Protector Corporal FPS 30',      'Herbal Nube',      3, 'Resistente al agua por 80 minutos.',                         299.00, 22, 8),
('SOL-003', 'Bruma Solar FPS 50 Reaplicable', 'Lumière Botánica', 3, 'Se aplica sobre el maquillaje.',                             389.00,  7, 8),
('SOL-004', 'Gel Post-Sol Aloe Vera',         'Herbal Nube',      3, 'Calma y regenera la piel después del sol.',                  189.00, 19, 5),
-- Cabello (4)
('CAB-001', 'Shampoo Argan Reparador',        'Lumière Botánica', 4, 'Para cabello seco y dañado.',                                239.00, 36, 8),
('CAB-002', 'Acondicionador Coco y Keratina', 'Lumière Botánica', 4, 'Desenreda y aporta brillo.',                                 249.00, 29, 8),
('CAB-003', 'Mascarilla Capilar Intensiva',   'Rosa Mística',     4, 'Tratamiento semanal de nutrición profunda.',                 319.00,  9, 5),
('CAB-004', 'Aceite Anti-Frizz',              'Velvet Studio',    4, 'Controla el frizz en días húmedos.',                         279.00, 14, 5),
-- Fragancias (5)
('FRA-001', 'Eau de Parfum Jardín de Noche',  'Rosa Mística',     5, 'Notas de jazmín, vainilla y sándalo. 50 ml.',                899.00, 11, 3),
('FRA-002', 'Bruma Corporal Peonía',          'Aurora Skin',      5, 'Fragancia fresca y ligera. 200 ml.',                         229.00, 38, 6),
('FRA-003', 'Colonia Cítricos del Mediterráneo','Herbal Nube',    5, 'Bergamota, limón y neroli. 100 ml.',                         549.00,  2, 3),
-- Unas (6)
('UNA-001', 'Esmalte Gel Rojo Cereza',        'Velvet Studio',    6, 'Efecto gel sin lámpara, 10 días de duracion.',               129.00, 60, 10),
('UNA-002', 'Esmalte Nude Satinado',          'Velvet Studio',    6, 'Tono neutro de acabado satinado.',                           129.00, 44, 10),
('UNA-003', 'Aceite de Cutícula Almendra',    'Herbal Nube',      6, 'Hidrata y fortalece cutículas.',                             119.00, 21, 5);

-- ---------------------------------------------------------
-- 5. IMAGENES (fotos libres de Unsplash guardadas en wwwroot/img/productos)
-- ---------------------------------------------------------
UPDATE productos SET imagen_url = CONCAT('img/productos/', sku, '.webp') WHERE id > 0;
