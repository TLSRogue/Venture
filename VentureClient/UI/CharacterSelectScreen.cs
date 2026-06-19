using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Myra.Graphics2D.UI;
using Myra.Graphics2D.UI.Styles;
using VentureClient.Models;

namespace VentureClient.UI
{
    public class CharacterSelectScreen : IScreen
    {
        private Panel _mainPanel;
        private TextBox _nameField;
        private Label _statusLabel;
        private string _selectedAvatar = "🧑";
        private Label _selectedAvatarLabel;

        public void Initialize()
        {
            _mainPanel = new Panel();

            // Background / Layout
            var grid = new Grid
            {
                RowSpacing = 15,
                ColumnSpacing = 15,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Width = 450,
                Padding = new Myra.Graphics2D.Thickness(25)
            };

            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Title
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Name Label
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Name Field
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Avatar Selection
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Actions
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Status

            // Title
            var titleLabel = new Label
            {
                Text = "⚔️ Venture RPG Client ⚔️",
                HorizontalAlignment = HorizontalAlignment.Center,
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Gold
            };
            Grid.SetRow(titleLabel, 0);
            grid.Widgets.Add(titleLabel);

            // Name Input Label
            var nameLabel = new Label
            {
                Text = "Enter Character Name:",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.White
            };
            Grid.SetRow(nameLabel, 1);
            grid.Widgets.Add(nameLabel);

            // Name Input Field
            _nameField = new TextBox
            {
                Text = "Hero",
                Font = VentureGame.Instance.SmallFont
            };
            Grid.SetRow(_nameField, 2);
            grid.Widgets.Add(_nameField);

            // Avatar select layout
            var avatarLayout = new VerticalStackPanel
            {
                Spacing = 5
            };
            Grid.SetRow(avatarLayout, 3);

            var selectLabel = new Label
            {
                Text = "Select Avatar:",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.White
            };
            avatarLayout.Widgets.Add(selectLabel);

            var avatarButtons = new HorizontalStackPanel { Spacing = 10 };
            string[] avatars = { "🧑", "🧙", "⚔️", "🏹", "🧛", "🛡️" };
            foreach (var av in avatars)
            {
                var btn = MyraExtensions.CreateButton(av, VentureGame.Instance.MainFont);
                btn.Width = 45;
                btn.Height = 45;
                btn.Click += (sender, e) =>
                {
                    _selectedAvatar = av;
                    _selectedAvatarLabel.Text = $"Selected Avatar: {av}";
                };
                avatarButtons.Widgets.Add(btn);
            }
            avatarLayout.Widgets.Add(avatarButtons);

            _selectedAvatarLabel = new Label
            {
                Text = $"Selected Avatar: {_selectedAvatar}",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.Yellow,
                Padding = new Myra.Graphics2D.Thickness(0, 5, 0, 0)
            };
            avatarLayout.Widgets.Add(_selectedAvatarLabel);
            grid.Widgets.Add(avatarLayout);

            // Buttons panel
            var buttonsPanel = new HorizontalStackPanel
            {
                Spacing = 15,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            Grid.SetRow(buttonsPanel, 4);

            var btnLoad = MyraExtensions.CreateButton("Load Character", VentureGame.Instance.SmallFont);
            btnLoad.Width = 140;
            btnLoad.Height = 35;
            btnLoad.Click += async (sender, e) =>
            {
                string name = _nameField.Text.Trim();
                if (string.IsNullOrEmpty(name))
                {
                    ShowStatus("Character name cannot be empty.", Color.Red);
                    return;
                }
                ShowStatus("Attempting to load character...", Color.Cyan);
                await VentureGame.Instance.Network.EmitLoadCharacter(name);
            };

            var btnRegister = MyraExtensions.CreateButton("Create New", VentureGame.Instance.SmallFont);
            btnRegister.Width = 140;
            btnRegister.Height = 35;
            btnRegister.Click += async (sender, e) =>
            {
                string name = _nameField.Text.Trim();
                if (string.IsNullOrEmpty(name))
                {
                    ShowStatus("Character name cannot be empty.", Color.Red);
                    return;
                }
                ShowStatus("Attempting to register character...", Color.Cyan);
                await VentureGame.Instance.Network.EmitRegisterPlayer(name, _selectedAvatar);
            };

            buttonsPanel.Widgets.Add(btnLoad);
            buttonsPanel.Widgets.Add(btnRegister);
            grid.Widgets.Add(buttonsPanel);

            // Status Label
            _statusLabel = new Label
            {
                Text = "Not connected. Waiting for server...",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.Gray,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            Grid.SetRow(_statusLabel, 5);
            grid.Widgets.Add(_statusLabel);

            // Add grid to panel
            _mainPanel.Widgets.Add(grid);

            // Bind listeners
            VentureGame.Instance.Network.OnConnected += HandleConnected;
            VentureGame.Instance.Network.OnDisconnected += HandleDisconnected;
            VentureGame.Instance.Network.OnLoadError += HandleLoadError;
            VentureGame.Instance.Network.OnCharacterUpdate += HandleCharacterUpdate;

            // Set initial connection status
            if (VentureGame.Instance.Network.IsConnected)
            {
                HandleConnected();
            }
        }

        public void LoadContent()
        {
            VentureGame.Instance.Desktop.Root = _mainPanel;
        }

        private void ShowStatus(string text, Color color)
        {
            _statusLabel.Text = text;
            _statusLabel.TextColor = color;
        }

        private void HandleConnected()
        {
            ShowStatus("Connected! Enter your name to start.", Color.Green);
        }

        private void HandleDisconnected()
        {
            ShowStatus("Disconnected from server. Reconnecting...", Color.Red);
        }

        private void HandleLoadError(string errorMsg)
        {
            ShowStatus($"Error: {errorMsg}", Color.Red);
        }

        private void HandleCharacterUpdate(CharacterState character)
        {
            ShowStatus($"Character {character.CharacterName} loaded!", Color.Green);
            // Transition to Main Hub Screen
            VentureGame.Instance.ScreenManager.ChangeScreen(new MainHubScreen());
        }

        public void Update(GameTime gameTime)
        {
        }

        public void Draw(SpriteBatch spriteBatch, GameTime gameTime)
        {
        }

        public void Unload()
        {
            // Unsubscribe from network events to avoid memory leaks
            if (VentureGame.Instance?.Network != null)
            {
                VentureGame.Instance.Network.OnConnected -= HandleConnected;
                VentureGame.Instance.Network.OnDisconnected -= HandleDisconnected;
                VentureGame.Instance.Network.OnLoadError -= HandleLoadError;
                VentureGame.Instance.Network.OnCharacterUpdate -= HandleCharacterUpdate;
            }
        }
    }
}
