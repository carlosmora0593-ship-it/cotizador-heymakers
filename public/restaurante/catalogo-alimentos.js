// Biblioteca de nombres e iconos para armar una carta. Los precios, costos,
// modificadores y datos fiscales se definen en cada restaurante.
const CATALOGO_ALIMENTOS = [
  { grupo: "Tacos y volcanes", icono: "🌮", platillos: [
    "Taco al pastor", "Taco de bistec", "Taco de suadero", "Taco de carnitas", "Taco de arrachera",
    "Taco de chorizo", "Taco de lengua", "Taco de cabeza", "Taco de tripa", "Taco de barbacoa",
    "Taco de birria", "Taco de cochinita pibil", "Taco de pescado", "Taco de camarón",
    "Taco de nopales", "Taco de canasta", "Taco campechano", "Gringa al pastor",
    "Volcán de bistec", "Volcán de chorizo", "Volcán al pastor", "Costra de arrachera"
  ] },
  { grupo: "Antojitos mexicanos", icono: "🫔", platillos: [
    "Quesadilla de queso", "Quesadilla de huitlacoche", "Quesadilla de flor de calabaza",
    "Quesadilla de bistec", "Quesadilla de chorizo", "Sope de pollo", "Sope de chorizo",
    "Gordita de chicharrón", "Gordita de frijol", "Huarache de bistec", "Tlacoyo de haba",
    "Tlayuda de tasajo", "Tostada de tinga", "Tostada de pata", "Flautas de pollo",
    "Flautas de papa", "Pambazo de papa con chorizo", "Tamal verde", "Tamal de rajas",
    "Tamal oaxaqueño", "Corundas con crema", "Uchepo con crema", "Esquites", "Elote preparado"
  ] },
  { grupo: "Menudo, pozoles y caldos", icono: "🍲", platillos: [
    "Menudo chico", "Menudo mediano", "Menudo grande", "Menudo para llevar",
    "Pozole rojo de cerdo", "Pozole verde de pollo", "Pozole blanco", "Caldo de res",
    "Caldo de pollo", "Caldo tlalpeño", "Caldo de camarón", "Caldo de pescado",
    "Consomé de birria", "Consomé de barbacoa", "Sopa azteca", "Sopa de fideo", "Caldo michi"
  ] },
  { grupo: "Desayunos y brunch", icono: "🍳", platillos: [
    "Chilaquiles verdes", "Chilaquiles rojos", "Chilaquiles con arrachera", "Enfrijoladas",
    "Huevos rancheros", "Huevos divorciados", "Huevos a la mexicana", "Huevos con machaca",
    "Huevos con chorizo", "Omelette de champiñones", "Omelette de jamón y queso",
    "Molletes con pico de gallo", "Hot cakes", "Waffles con fruta", "Pan francés",
    "Tostada de aguacate", "Bowl de yogur y granola", "Fruta de temporada",
    "Burrito de desayuno", "Croissant de jamón y queso"
  ] },
  { grupo: "Cocina mexicana", icono: "🌶️", platillos: [
    "Enchiladas verdes", "Enchiladas rojas", "Enchiladas suizas", "Enchiladas placeras",
    "Enmoladas de pollo", "Mole poblano con pollo", "Mole negro con pollo", "Chile relleno de queso",
    "Chile en nogada", "Pechuga en salsa de poblano", "Bistec a la mexicana", "Carne en su jugo",
    "Albóndigas al chipotle", "Cochinita pibil", "Birria de res", "Barbacoa de borrego",
    "Carnitas surtidas", "Pescado a la veracruzana", "Pechuga a la mexicana", "Picadillo de res"
  ] },
  { grupo: "Entradas y botanas", icono: "🥑", platillos: [
    "Guacamole con totopos", "Queso fundido", "Queso fundido con chorizo", "Nachos con queso",
    "Nachos con arrachera", "Jalapeños rellenos", "Dedos de queso", "Aros de cebolla",
    "Papas gajo", "Papas a la francesa", "Papas con tocino", "Chicharrón de queso",
    "Bruschetta de jitomate", "Tabla de quesos", "Carpaccio de res", "Hummus con pan pita"
  ] },
  { grupo: "Parrilla y cortes", icono: "🥩", platillos: [
    "Arrachera a la parrilla", "Rib eye", "New York", "Tomahawk", "Picaña",
    "Filete de res", "Sirloin", "T-bone", "Costillas BBQ", "Costilla de res",
    "Chistorra a la parrilla", "Brocheta de res", "Parrillada mixta", "Chamorro adobado",
    "Chuleta de cerdo", "Bistec encebollado"
  ] },
  { grupo: "Pollo y alitas", icono: "🍗", platillos: [
    "Alitas BBQ", "Alitas búfalo", "Alitas mango habanero", "Alitas limón y pimienta",
    "Boneless BBQ", "Boneless búfalo", "Boneless mango habanero", "Tiras de pollo empanizadas",
    "Nuggets de pollo", "Pollo asado", "Pollo rostizado", "Pechuga a la plancha",
    "Milanesa de pollo", "Pollo frito", "Pollo al limón", "Pollo a la naranja"
  ] },
  { grupo: "Pescados y mariscos", icono: "🦐", platillos: [
    "Ceviche de pescado", "Ceviche de camarón", "Ceviche mixto", "Aguachile verde",
    "Aguachile rojo", "Tostada de atún", "Tostada de pulpo", "Tostada de camarón",
    "Cóctel de camarón", "Campechana de mariscos", "Camarones al ajillo", "Camarones a la diabla",
    "Camarones empanizados", "Camarones al coco", "Pulpo a las brasas", "Mojarra frita",
    "Filete de pescado al mojo de ajo", "Salmón a la plancha", "Atún sellado", "Paella de mariscos"
  ] },
  { grupo: "Hamburguesas y hot dogs", icono: "🍔", platillos: [
    "Hamburguesa clásica", "Hamburguesa con queso", "Hamburguesa doble", "Hamburguesa con tocino",
    "Hamburguesa BBQ", "Smash burger", "Hamburguesa de pollo crujiente", "Hamburguesa de portobello",
    "Hamburguesa vegetariana", "Hot dog clásico", "Hot dog con tocino", "Hot dog sonorense",
    "Chili dog", "Salchipapas"
  ] },
  { grupo: "Tortas y sándwiches", icono: "🥪", platillos: [
    "Torta de milanesa", "Torta cubana", "Torta de pierna", "Torta de jamón",
    "Torta ahogada", "Torta de carnitas", "Torta de cochinita", "Guajolota",
    "Club sándwich", "Sándwich de pollo", "Sándwich de atún", "Sándwich de queso gratinado",
    "Panini caprese", "Panini de pavo", "Baguette de roast beef", "Wrap de pollo"
  ] },
  { grupo: "Pizzas", icono: "🍕", platillos: [
    "Pizza margarita", "Pizza de pepperoni", "Pizza hawaiana", "Pizza cuatro quesos",
    "Pizza de champiñones", "Pizza vegetariana", "Pizza de arrachera", "Pizza mexicana",
    "Pizza de jamón serrano", "Pizza de pollo BBQ", "Pizza de anchoas", "Calzone de jamón"
  ] },
  { grupo: "Pastas y cocina italiana", icono: "🍝", platillos: [
    "Espagueti a la boloñesa", "Espagueti carbonara", "Fettuccine Alfredo", "Fettuccine con camarones",
    "Penne al arrabbiata", "Pasta al pesto", "Lasaña de res", "Lasaña vegetariana",
    "Ravioles de espinaca", "Gnocchi de papa", "Risotto de hongos", "Risotto de parmesano"
  ] },
  { grupo: "Sushi y cocina asiática", icono: "🍣", platillos: [
    "Rollo California", "Rollo Filadelfia", "Rollo de camarón tempura", "Rollo de atún picante",
    "Rollo de salmón", "Nigiri de salmón", "Nigiri de atún", "Sashimi de salmón",
    "Gyozas de cerdo", "Edamames", "Ramen de cerdo", "Ramen de pollo",
    "Yakisoba de res", "Yakimeshi mixto", "Arroz frito de camarón", "Pad thai de pollo",
    "Pollo teriyaki", "Bibimbap", "Rollitos primavera", "Curry verde de verduras"
  ] },
  { grupo: "Ensaladas y bowls", icono: "🥗", platillos: [
    "Ensalada César", "Ensalada César con pollo", "Ensalada griega", "Ensalada caprese",
    "Ensalada de espinaca y fresa", "Ensalada de atún", "Ensalada de nopales", "Ensalada de quinoa",
    "Bowl de pollo", "Bowl de salmón", "Poke de atún", "Bowl de garbanzos", "Bowl de falafel"
  ] },
  { grupo: "Vegetariano y vegano", icono: "🌱", platillos: [
    "Tacos de setas", "Tacos de coliflor", "Quesadillas de champiñones", "Burrito de verduras",
    "Milanesa de berenjena", "Berenjena a la parmesana", "Falafel con pita",
    "Tofu teriyaki", "Tostada de garbanzos", "Hamburguesa de lentejas", "Tortitas de papa",
    "Chiles poblanos con quinoa"
  ] },
  { grupo: "Guarniciones", icono: "🍚", platillos: [
    "Arroz rojo", "Arroz blanco", "Frijoles refritos", "Frijoles de la olla",
    "Frijoles charros", "Puré de papa", "Papa al horno", "Verduras al vapor",
    "Nopales asados", "Cebollitas asadas", "Ensalada de col", "Tortillas de maíz",
    "Tortillas de harina", "Totopos", "Pan de ajo", "Plátano macho frito"
  ] },
  { grupo: "Panadería y repostería", icono: "🥐", platillos: [
    "Concha de vainilla", "Concha de chocolate", "Pan de muerto", "Croissant de mantequilla",
    "Chocolatín", "Rol de canela", "Muffin de arándanos", "Galleta de chispas de chocolate",
    "Dona glaseada", "Panqué de limón", "Bisquet", "Bolillo", "Empanada de manzana"
  ] },
  { grupo: "Postres y helados", icono: "🍰", platillos: [
    "Flan napolitano", "Pastel de tres leches", "Pastel de chocolate", "Pay de limón",
    "Pay de queso", "Pay de manzana", "Churros con azúcar", "Churros rellenos",
    "Arroz con leche", "Gelatina de mosaico", "Fresas con crema", "Brownie con helado",
    "Crepa de cajeta", "Crepa de chocolate y plátano", "Tiramisú", "Helado de vainilla",
    "Helado de chocolate", "Nieve de limón", "Nieve de mango", "Panna cotta"
  ] },
  { grupo: "Café, té y chocolate", icono: "☕", platillos: [
    "Espresso", "Espresso doble", "Café americano", "Café de olla", "Café con leche",
    "Capuchino", "Latte", "Latte frío", "Latte de vainilla", "Moca", "Cold brew",
    "Frappé de café", "Chocolate caliente", "Té verde", "Té negro", "Té chai", "Matcha latte"
  ] },
  { grupo: "Bebidas sin alcohol", icono: "🥤", platillos: [
    "Agua de horchata", "Agua de jamaica", "Agua de tamarindo", "Agua de limón",
    "Agua de pepino con limón", "Agua de guayaba", "Agua mineral", "Agua natural",
    "Refresco de cola", "Refresco de naranja", "Limonada mineral", "Naranjada mineral",
    "Jugo de naranja", "Jugo verde", "Licuado de plátano", "Malteada de fresa",
    "Malteada de chocolate", "Mojito sin alcohol", "Piñada sin alcohol"
  ] },
  { grupo: "Cervezas, vinos y cocteles", icono: "🍹", platillos: [
    "Cerveza clara", "Cerveza oscura", "Cerveza artesanal", "Michelada clásica",
    "Michelada con clamato", "Chelada", "Margarita", "Paloma", "Cantarito", "Mojito",
    "Piña colada", "Mezcalita", "Carajillo", "Negroni", "Gin tonic", "Sangría",
    "Copa de vino tinto", "Copa de vino blanco", "Copa de vino rosado", "Copa de espumoso"
  ] }
];
