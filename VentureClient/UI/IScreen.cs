using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace VentureClient.UI
{
    public interface IScreen
    {
        void Initialize();
        void LoadContent();
        void Update(GameTime gameTime);
        void Draw(SpriteBatch spriteBatch, GameTime gameTime);
        void Unload();
    }
}
