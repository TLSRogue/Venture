using System;
using System.IO;

try
{
    using var game = new VentureClient.VentureGame();
    game.Run();
}
catch (Exception ex)
{
    string crashText = $"=== CRITICAL GAME CRASH ===\nDate/Time: {DateTime.Now}\nError: {ex}\n";
    Console.WriteLine(crashText);
    File.WriteAllText("crashlog.txt", crashText);
}
