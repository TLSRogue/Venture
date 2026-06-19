using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace VentureClient.UI
{
    public class ScreenManager
    {
        public IScreen CurrentScreen { get; private set; }

        public void ChangeScreen(IScreen newScreen)
        {
            if (CurrentScreen != null)
            {
                CurrentScreen.Unload();
                VentureGame.Instance.Desktop.Root = null;
            }

            CurrentScreen = newScreen;
            if (CurrentScreen != null)
            {
                CurrentScreen.Initialize();
                CurrentScreen.LoadContent();
            }
        }

        public void Update(GameTime gameTime)
        {
            CurrentScreen?.Update(gameTime);
        }

        public void Draw(SpriteBatch spriteBatch, GameTime gameTime)
        {
            CurrentScreen?.Draw(spriteBatch, gameTime);
        }
    }
}
