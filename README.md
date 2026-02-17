# Raindoor Product Backup App

Esta es una aplicación personalizada de Shopify diseñada para realizar backups completos de tus productos de forma gratuita y sin tener que gestionar tokens manualmente después de la instalación inicial.

## Configuración en Shopify Partners

1. Ve a tu [Shopify Partners Dashboard](https://partners.shopify.com/).
2. Crea una nueva app (o usa una existente para pruebas).
3. En la sección **App Setup**:
   - **App URL**: `https://tu-url-de-render-o-ngrok.com`
   - **Allowed redirection URL(s)**: `https://tu-url-de-render-o-ngrok.com/auth/callback`
4. Copia el **API Key** y el **API Secret** a tu archivo `.env`.

## Instalación Local

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Inicia el servidor:
   ```bash
   node server.js
   ```

## Cómo usar

1. Abre la URL de tu app en el navegador.
2. Introduce el dominio de tu tienda (ej: `raindoor-desarrollo.myshopify.com`).
3. Haz clic en "Instalar App". Shopify te pedirá permisos para leer tus productos.
4. Una vez redirigido, verás el botón **"Generar Backup (JSON)"**.
5. Al hacer clic, la app descargará automáticamente todos tus productos (incluyendo variantes e imágenes) en un archivo `.json`.

## Ventajas de esta solución

- **Sin límites**: A diferencia de las apps gratuitas de la App Store que limitan a 50 productos, esta app puede descargar tus 1,452 productos sin problemas.
- **Sin Token Manual**: Utiliza el flujo oficial de OAuth, por lo que no tienes que pegar tokens en el código cada vez.
- **Eficiencia**: Utiliza **GraphQL** para descargar productos en bloques de 250, lo que minimiza el impacto en la API de Shopify.
