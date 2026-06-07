import javax.swing.*;
import java.awt.*;

public class TestForm extends JFrame {
    public TestForm() {
        setTitle("Test Form");
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setSize(400, 300);
        setLayout(new GridLayout(0, 2, 10, 10));

        add(new JLabel("First Name:"));
        JTextField firstName = new JTextField();
        firstName.getAccessibleContext().setAccessibleName("firstName");
        add(firstName);

        add(new JLabel("Last Name:"));
        JTextField lastName = new JTextField();
        lastName.getAccessibleContext().setAccessibleName("lastName");
        add(lastName);

        add(new JLabel("Email:"));
        JTextField email = new JTextField();
        email.getAccessibleContext().setAccessibleName("email");
        add(email);

        add(new JLabel("Country:"));
        JComboBox<String> country = new JComboBox<>(new String[]{"USA", "UK", "Other"});
        country.getAccessibleContext().setAccessibleName("country");
        add(country);

        JCheckBox agree = new JCheckBox("I agree");
        agree.getAccessibleContext().setAccessibleName("agreeCheckbox");
        add(agree);

        JButton submit = new JButton("Submit");
        submit.getAccessibleContext().setAccessibleName("submitButton");
        add(submit);
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> new TestForm().setVisible(true));
    }
}
