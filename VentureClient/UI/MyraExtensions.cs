using Microsoft.Xna.Framework;
using FontStashSharp;
using Myra.Graphics2D;
using Myra.Graphics2D.Brushes;
using Myra.Graphics2D.UI;

namespace VentureClient.UI
{
    public static class MyraExtensions
    {
        public static string GetText(this Button button)
        {
            if (button.Content is Label label)
            {
                return label.Text;
            }
            return null;
        }

        public static void SetText(this Button button, string text, SpriteFontBase font = null, Color? textColor = null)
        {
            if (button.Content is Label label)
            {
                label.Text = text;
                if (font != null) label.Font = font;
                if (textColor.HasValue) label.TextColor = textColor.Value;
            }
            else
            {
                button.Content = new Label
                {
                    Text = text,
                    Font = font,
                    TextColor = textColor ?? Color.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
            }
        }

        public static void SetFont(this Button button, SpriteFontBase font)
        {
            if (button.Content is Label label)
            {
                label.Font = font;
            }
        }

        public static Button CreateButton(string text, SpriteFontBase font = null, Color? textColor = null)
        {
            var btn = new Button
            {
                Padding = new Thickness(14, 6),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(51, 65, 85)),
                Background = new SolidBrush(new Color(30, 41, 59))
            };
            btn.SetText(text, font, textColor);
            return btn;
        }
    }
}
