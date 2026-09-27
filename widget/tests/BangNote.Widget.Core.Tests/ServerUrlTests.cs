namespace BangNote.Widget.Core.Tests;

public class ServerUrlTests
{
    [Theory]
    [InlineData(" https://bangnote.vercel.app/ ", "https://bangnote.vercel.app")]
    [InlineData("https://a.b/sub///", "https://a.b/sub")]
    [InlineData("http://localhost:3000", "http://localhost:3000")]
    [InlineData("https://a.b/?x=1#y", "https://a.b")]
    public void Normalizes(string input, string expected) => Assert.Equal(expected, ServerUrl.Normalize(input));

    [Theory]
    [InlineData("bangnote.vercel.app")]
    [InlineData("ftp://a.b")]
    [InlineData("")]
    public void RejectsInvalid(string input) => Assert.Throws<ArgumentException>(() => ServerUrl.Normalize(input));
}
